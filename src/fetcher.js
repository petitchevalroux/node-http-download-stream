"use strict";
const request = require("request"),
    path = require("path"),
    HttpError = require(path.join(__dirname, "errors", "http")),
    {
        RateLimiter
    } = require("limiter"),
    retry = require("retry"),
    Promise = require("bluebird");

class HttpFetcher {
    constructor(options) {
        options = Object.assign({
            "timeout": 5000,
            "followRedirect": true,
            "maxRedirects": 2,
            "readableObjectMode": true,
            "rateCount": 5,
            "rateWindow": 10000,
            "retries": 3,
            "retryMinTimeout": 2500
        }, options || {});
        if (typeof(options.httpClient) === "undefined") {
            this.httpClient = request.defaults({
                "timeout": options.timeout,
                "followRedirect": options.followRedirect,
                "maxRedirects": options.maxRedirects,
                "gzip": true,
                "headers": {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:49.0) Gecko/20100101 Firefox/49.0"
                }
            });
        } else {
            this.httpClient = options.httpClient;
        }
        this.limiter = new RateLimiter(options.rateCount, options.rateWindow);
        this.retries = options.retries;
        this.retryMinTimeout = options.retryMinTimeout;
    }

    attempt(url, callback) {
        const self = this;
        self.limiter.removeTokens(1, function(err) {
            if (err) {
                callback(err);
                return;
            }
            self.httpClient.get(url, (err, response, body) => {
                if (err) {
                    callback(Object.assign(
                        new HttpError(err), {
                            "url": url
                        }
                    ));
                    return;
                }
                callback(
                    null, {
                        "input": url,
                        "output": {
                            "headers": response.headers,
                            "statusCode": response.statusCode,
                            "body": body
                        }
                    }
                );
            });
        });
    }

    fetch(url) {
        return new Promise((resolve, reject) => {
            const self = this;
            const operation = retry.operation({
                "minTimeout": this.retryMinTimeout,
                "retries": this.retries
            });
            operation.attempt((attempt) => {
                self.attempt(url, function(err, response) {
                    if (!err && response.output.statusCode >
                        499) {
                        if (attempt <= self.retries) {
                            err = 499;
                        }
                    }
                    if (operation.retry(err)) {
                        return;
                    }
                    const rejectError = err ?
                        operation.mainError() :
                        null;
                    if (rejectError) {
                        return reject(rejectError);
                    }
                    resolve(Object.assign(response, {
                        "attempt": attempt
                    }));
                });
            });
        });
    }
}

module.exports = HttpFetcher;
