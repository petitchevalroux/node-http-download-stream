"use strict";
const {
    Transform
} = require("stream"),
    request = require("request"),
    path = require("path"),
    HttpError = require(path.join(__dirname, "errors", "http")), {
        RateLimiter
    } = require("limiter"),
    retry = require("retry");

class HttpDownloadStream extends Transform {
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
        super(options);
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

    get(chunk, callback) {
        const self = this;
        self.limiter.removeTokens(1, function(err) {
            if (err) {
                callback(err);
                return;
            }
            if (Buffer.isBuffer(chunk)) {
                chunk = chunk.toString();
            }
            self.httpClient.get(chunk, (err, response, body) => {
                if (err) {
                    callback(new HttpError(err));
                    return;
                }
                callback(
                    null, {
                        "input": chunk,
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

    _transform(chunk, encoding, callback) {
        const self = this;
        const operation = retry.operation({
            "minTimeout": this.retryMinTimeout,
            "retries": this.retries
        });
        operation.attempt((attempt) => {
            self.get(chunk, function(err, response) {
                if (!err && response.output.statusCode >
                    499) {
                    if (attempt <= self.retries) {
                        err = 499;
                    }
                }
                if (operation.retry(err)) {
                    return;
                }
                if (response) {
                    response.attempt = attempt;
                }
                callback(err ? operation.mainError() : null,
                    response);
            });
        });
    }
}

module.exports = HttpDownloadStream;
