"use strict";

const {
    Transform
} = require("stream");
const request = require("request");
const Error = require("@petitchevalroux/error");

class HttpDownloadStream extends Transform {
    constructor(options) {
        options = Object.assign({
            "timeout": 5000,
            "followRedirect": true,
            "maxRedirects": 2,
            "readableObjectMode": true
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
    }

    _transform(chunk, encoding, callback) {
        if (Buffer.isBuffer(chunk)) {
            chunk = chunk.toString();
        }
        this.httpClient.get(chunk, (err, response, body) => {
            if (err) {
                callback(new Error("Unable to download (chunk: %s)",
                    chunk, err));
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
    }
}

module.exports = HttpDownloadStream;
