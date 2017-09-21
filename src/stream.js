"use strict";
const {
    Transform
} = require("stream"),
    path = require("path"),
    urlModule = require("url"),
    Promise = require("bluebird"),
    Fetcher = require(path.join(__dirname, "fetcher"));

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
        this.maxHostFetchers = instanceOptions.maxParallelHosts;
        delete instanceOptions.maxParallelHosts;
        this.options = instanceOptions;
        this.hostFetchers = {};
        this.downloadingCount = 0;
    }

    downloadUrl(url) {
        try {
            const host = urlModule.parse(url)
                .hostname;
            return this.getHostFetcher(host)
                .then((fetcher) => {
                    fetcher.lastUsed = new Date()
                        .getTime();
                    return fetcher.fetch(url);
                });
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

    getHostFetcher(host) {
        if ((typeof this.hostFetchers[host]) !== "undefined") {
            return Promise.resolve(this.hostFetchers[host]);
        }
        if (this.getHostFetcherCount() >= this.maxHostFetchers) {
            try {
                this.deleteLeastRecentlyUsedFetcher();
            } catch (e) {
                return Promise.reject(e);
            }
        }
        return this.createHostFetcher(host);
    }

    createHostFetcher(host) {
        this.hostFetchers[host] = new Fetcher(this.options);
        return Promise.resolve(this.hostFetchers[host]);
    }

    deleteLeastRecentlyUsedFetcher() {
        const hostToDelete = this.getLeastRecentlyUsedFetcherHost();
        if (!hostToDelete || !this.hostFetchers[hostToDelete]) {
            throw new Error(
                "Unable to find an host fetcher to delete (host:" +
                hostToDelete + ")");
        }
        delete this.hostFetchers[hostToDelete];
    }

    getHostFetcherCount() {
        return Object.getOwnPropertyNames(this.hostFetchers)
            .length;
    }

    getLeastRecentlyUsedFetcherHost() {
        const hosts = Object.getOwnPropertyNames(this.hostFetchers);
        if (!hosts.length) {
            return null;
        }
        const self = this;
        hosts.sort((a, b) => {
            if (self.hostFetchers[a].lastUsed === self.hostFetchers[
                    b].lastUsed) {
                return 0;
            }
            return (self.hostFetchers[a].lastUsed <
                    self.hostFetchers[
                        b].lastUsed) ?
                -1 : 1;
        });
        return hosts[0];
    }


}

module.exports = HttpDownloadStream;
