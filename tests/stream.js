"use strict";
const path = require("path"),
    Promise = require("bluebird"),
    {
        Stream,
        HttpError
    } = require(path.join(__dirname, "..", "src")),
    {
        PassThrough,
        Writable
    } = require("stream"),
    nock = require("nock"),
    assert = require("assert");

describe("Stream", () => {
    it("Should emit an HttpError when downloading do", () => {
        return new Promise(function(resolve) {
            const transform = new Stream({
                "retries": 0
            });
            nock("http://example.com")
                .get("/error")
                .replyWithError({
                    message: "something awful happened",
                    code: "AWFUL_ERROR"
                });
            const input = new PassThrough();
            input.pipe(transform)
                .on("error", function(err) {
                    assert(err instanceof HttpError);
                    assert.equal(err.url,
                        "http://example.com/error"
                    );
                    resolve();
                });
            input.write("http://example.com/error");
        });

    });

    it("Should use construct httpClient", () => {
        const transform = new Stream({
            httpClient: "foo"
        });
        assert.equal(transform.options.httpClient, "foo");
    });

    it("Should not download an url when another one is downloading", () => {
        return new Promise((resolve, reject) => {
            let firstRequestDone = false;
            nock("http://example.com")
                .get("/1")
                .reply(function(uri, request, cb) {
                    setTimeout(() => {
                        cb(null, [200, "1"]);
                    }, 1500);
                })
                .get("/2")
                .reply((uri, request, cb) => {
                    if (firstRequestDone === true) {
                        resolve();
                    } else {
                        reject(new Error(
                            "Receive a second request before " +
                            "writting first request output"
                        ));
                    }
                    setTimeout(() => {
                        cb(null, [200, "2"]);
                    }, 100);
                });
            const transform = new Stream();
            const input = new PassThrough();
            const output = new Writable({
                "objectMode": true,
                "write": (chunk, encoding,
                    callback) => {
                    if (firstRequestDone ===
                        false &&
                        chunk.input ===
                        "http://example.com/1"
                    ) {
                        firstRequestDone =
                            true;
                    }
                    callback();
                }
            });
            input.pipe(transform)
                .pipe(output);
            input.write("http://example.com/1");
            input.write("http://example.com/2");
        });
    });

    it("Should respect rate settings", (done) => {
        let lastRequestTime;
        nock("http://example.com")
            .get("/first")
            .reply((uri, request, cb) => {
                lastRequestTime = new Date()
                    .getTime();
                cb(null, 200);
            })
            .get("/second")
            .reply((uri, request, cb) => {
                const date = new Date()
                    .getTime();
                assert(date - lastRequestTime < 333);
                lastRequestTime = new Date()
                    .getTime();
                cb(null, 200);
            })
            .get("/third")
            .reply((uri, request, cb) => {
                const date = new Date()
                    .getTime();
                assert(date - lastRequestTime >= 333);
                done();
                cb(null, 200);
            });
        const transform = new Stream({
            rateCount: 2,
            rateWindow: 333
        });
        const input = new PassThrough();
        const output = new Writable({
            "objectMode": true,
            "write": (chunk, encoding, callback) => {
                callback();
            }
        });
        input
            .pipe(transform)
            .pipe(output);
        input.write("http://example.com/first");
        input.write("http://example.com/second");
        input.write("http://example.com/third");

    });

    it("Should retry until retry settings on server error", (done) => {
        let requestCount = 0;
        nock("http://example.com")
            .get("/retry")
            .times(5)
            .reply((uri, request, cb) => {
                requestCount++;
                cb(null, [500, ""]);
            });
        const results = [];
        const input = new PassThrough();
        const output = new Writable({
            "objectMode": true,
            "write": (chunk, encoding, callback) => {
                results.push(chunk);
                callback();
            }
        });
        const transform = new Stream({
            retries: 4,
            retryMinTimeout: 0
        });
        input
            .pipe(transform)
            .pipe(output)
            .on("finish", () => {
                assert.equal(requestCount, 5,
                    "requestCount");
                assert.equal(results.length, 1,
                    "results.length");
                assert.equal(results[0].attempt, 5,
                    "attempt");
                assert.equal(results[0].output.statusCode,
                    500, "statusCode");
                done();
            });
        input.write("http://example.com/retry");
        input.push(null);
    });

    it("Should retry on timeout", (done) => {
        let requestCount = 0;
        nock("http://example.com")
            .get("/timeout")
            .times(2)
            .delay(100)
            .reply((uri, request, cb) => {
                requestCount++;
                cb(null, [200, ""]);
            })
            .get("/timeout")
            .times(2)
            .reply((uri, request, cb) => {
                requestCount++;
                cb(null, [200, ""]);
            });
        const results = [];
        const input = new PassThrough();
        const output = new Writable({
            "objectMode": true,
            "write": (chunk, encoding, callback) => {
                results.push(chunk);
                callback();
            }
        });
        const transform = new Stream({
            "timeout": 99,
            retries: 2,
            retryMinTimeout: 0
        });
        input
            .pipe(transform)
            .pipe(output)
            .on("finish", () => {
                assert.equal(requestCount, 3,
                    "requestCount");
                assert.equal(results.length, 1,
                    "results.length");
                assert.equal(results[0].attempt, 3,
                    "attempt");
                assert.equal(results[0].output.statusCode,
                    200, "statusCode");
                done();
            });
        input.write("http://example.com/timeout");
        input.push(null);
    });

    it("Should use maxParallelHosts", () => {
        return new Promise(function(resolve) {
            const transform = new Stream({
                "retries": 0,
                maxParallelHosts: 2
            });
            const input = new PassThrough();
            input.pipe(transform)
                .on("finish", function() {
                    assert.deepEqual(
                        transform.getFetcherHosts()
                        .sort(), [
                            "example2.com",
                            "example3.com"
                        ]);
                    resolve();
                });
            [
                "http://example.com",
                "http://example2.com",
                "http://example3.com"
            ].forEach((host) => {
                nock(host)
                    .get("/index")
                    .reply((uri, request, cb) => {
                        cb(null, [200,
                            "content"
                        ]);
                    });
                input.write(host + "/index");
            });
            input.push(null);
        });
    });
});
