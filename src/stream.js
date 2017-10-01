"use strict";
const {
    Duplex
} = require("stream"),
    path = require("path"),
    urlModule = require("url"),
    Promise = require("bluebird"),
    Fetcher = require(path.join(__dirname, "fetcher")),
    Cache = require("lru-cache");

class HttpDownloadStream extends Duplex {
    constructor(options) {
        const instanceOptions = Object.assign({
            "timeout": 5000,
            "followRedirect": true,
            "maxRedirects": 2,
            "readableObjectMode": true,
            "rateCount": 5,
            "rateWindow": 10000,
            "retries": 3,
            "retryMinTimeout": 2500,
            "maxParallelHosts": 10
        }, options || {});
        super(instanceOptions);
        this.fetchersCache = new Cache(instanceOptions.maxParallelHosts);
        this.options = instanceOptions;
        this.downloadingCount = 0;
        this.readBufferFull = false;
        this.results = [];
        this.emitDrain = false;
        const self = this;
        this.on("finish", () => {
            self.finishEmitted = true;
        });
    }

    downloadUrl(url) {
        try {
            return this.getFetcher(
                    urlModule.parse(url)
                    .hostname
                )
                .fetch(url);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    _write(chunk, encoding, callback) {
        this.downloadingCount++;
        const url = chunk.toString();
        const self = this;
        this.downloadUrl(url)
            .then((result) => {
                self.downloadEnd();
                if (result) {
                    self.results.push(result);
                    self.processResultsBuffer();
                }
                return result;
            })
            .catch((e) => {
                self.downloadEnd();
                self.emit("error", e);
            });
        callback();
    }

    getFetcher(host) {
        let fetcher = this.fetchersCache.get(host);
        if (fetcher === undefined) {
            fetcher = new Fetcher(this.options);
            this.fetchersCache.set(host, fetcher);
        }
        return fetcher;
    }

    getFetcherHosts() {
        return this.fetchersCache.keys();
    }

    downloadEnd() {
        this.downloadingCount--;
        if (this.emitDrain === true) {
            this.emit("drain");
        }
    }

    processResultsBuffer() {
        if (!this.results.length) {
            if (this.finishEmitted && this.downloadingCount <= 0) {
                this.push(null);
            }
            this.readBufferFull = false;
            return;
        }
        this.readBufferFull = !this.push(this.results.pop());
        return this.processResultsBuffer();
    }

    _read() {
        this.processResultsBuffer();
    }

    write(chunk, encoding, callback) {
        this.emitDrain = (super.write(chunk, encoding, callback) &&
            this.canWrite()) ? false : true;
        return !this.emitDrain;
    }

    canWrite() {
        return !this.readBufferFull && this.fetchersCache.length < this.maxParallelHosts;
    }
}

module.exports = HttpDownloadStream;
