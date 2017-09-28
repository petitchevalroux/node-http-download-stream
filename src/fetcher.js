"use strict";
const got = require("got"),
    path = require("path"),
    HttpError = require(path.join(__dirname, "errors", "http")),
    {
        RateLimiter
    } = require("limiter"),
    retry = require("retry"),
    Promise = require("bluebird");

class HttpFetcher {
    constructor(options) {
        const instanceOptions = Object.assign({
            "timeout": 5000,
            "followRedirect": true,
            "maxRedirects": 2,
            "readableObjectMode": true,
            "rateCount": 5,
            "rateWindow": 10000,
            "retries": 3,
            "retryMinTimeout": 2500
        }, options || {});
        this.httpOptions = {
            "timeout": instanceOptions.timeout,
            "followRedirect": instanceOptions.followRedirect,
            "gzip": true,
            "headers": {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:49.0) Gecko/20100101 Firefox/49.0"
            },
            retries: 0
        };

        this.limiter = new RateLimiter(instanceOptions.rateCount,
            instanceOptions.rateWindow);
        this.retries = instanceOptions.retries;
        this.retryMinTimeout = instanceOptions.retryMinTimeout;
    }

    attempt(url, callback) {
        const self = this;
        self.limiter.removeTokens(1, function(err) {
            if (err) {
                callback(err);
                return;
            }
            got(url, self.httpOptions)
                .then((response) => {
                    callback(
                        null, {
                            "input": url,
                            "output": {
                                "headers": response.headers,
                                "statusCode": response.statusCode,
                                "body": response.body
                            }
                        }
                    );
                    return response;
                })
                .catch((err) => {
                    // Non 2xx code
                    if (err instanceof got.HTTPError) {
                        return callback(null, {
                            "input": url,
                            "output": {
                                "headers": err.headers ?
                                    err.headers : [],
                                "statusCode": err.statusCode,
                                "body": ""
                            }
                        });
                    }
                    callback(Object.assign(
                        new HttpError(err), {
                            "url": url,
                        }));
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
                    if (operation.retry(err || (
                            response.output.statusCode >
                            499 ?
                            new Error(
                                "Wrong http status " +
                                JSON.stringify({
                                    status: response
                                        .output
                                        .statusCode,
                                    url: url
                                })) : false))) {
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
