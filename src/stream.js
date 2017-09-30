"use strict";
const {
    Transform
} = require("stream"),
    path = require("path"),
    urlModule = require("url"),
    Promise = require("bluebird"),
    Fetcher = require(path.join(__dirname, "fetcher")),
    Cache = require("lru-cache");

class HttpDownloadStream extends Transform {
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
        delete instanceOptions.maxParallelHosts;
        this.options = instanceOptions;
        this.downloadingCount = 0;
    }

    downloadUrl(url) {
        try {
            return this.getFetcher(urlModule.parse(url)
                    .hostname)
                .fetch(url);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    _transform(chunk, encoding, callback) {
        this.downloadingCount++;
        const url = chunk.toString();
        const self = this;
        this.downloadUrl(url)
            .then((result) => {
                self.downloadingCount--;
                return callback(null, result);
            })
            .catch((e) => {
                self.downloadingCount--;
                callback(e);
            });
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
}

module.exports = HttpDownloadStream;
