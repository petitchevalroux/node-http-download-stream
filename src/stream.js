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
        this.buffer = [];
        this.hostFetchers = {};
    }

    _transform(chunk, encoding, callback) {
        try {
            const host = urlModule.parse(chunk.toString())
                .hostname;
            this.getHostFetcher(host)
                .then((fetcher) => {
                    fetcher.lastUsed = new Date()
                        .getTime();
                    return fetcher
                        .fetch(chunk.toString());
                })
                .then((result) => {
                    return callback(null, result);
                })
                .catch((err) => {
                    callback(err);
                });
        } catch (e) {
            callback(e);
        }
    }

    getHostFetcher(host) {
        if (this.getHostFetcherCount() >= this.maxHostFetchers) {
            const self = this;
            return this
                .deleteLeastRecentlyUsedFetcher()
                .then(() => {
                    return self.getHostFetcher(host);
                });
        }
        return typeof(this.hostFetchers[host]) !== "undefined" ?
            Promise.resolve(this.hostFetchers[host]) :
            this.createHostFetcher(host);
    }

    createHostFetcher(host) {
        this.hostFetchers[host] = new Fetcher(this.options);
        return Promise.resolve(this.hostFetchers[host]);
    }

    deleteLeastRecentlyUsedFetcher() {
        const self = this;
        return this
            .getLeastRecentlyUsedFetcherHost()
            .then((host) => {
                if (!host || !self.hostFetchers[host]) {
                    throw new Error(
                        "Unable to find an host fetcher to delete");
                }
                delete self.hostFetchers[host];
                return host;
            });
    }

    getHostFetcherCount() {
        return Object.getOwnPropertyNames(this.hostFetchers)
            .length;
    }

    getLeastRecentlyUsedFetcherHost() {
        return new Promise((resolve) => {
            const hosts = Object.getOwnPropertyNames(this.hostFetchers);
            if (!hosts.length) {
                return resolve(null);
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
            return resolve(hosts[0]);
        });
    }


}

module.exports = HttpDownloadStream;
