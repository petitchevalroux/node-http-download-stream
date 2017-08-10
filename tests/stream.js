"use strict";
const path = require("path");
const Promise = require("bluebird");
const Transform = require(path.join(__dirname, "..", "src", "stream"));
const {
    PassThrough,
    Writable
} = require("stream");
const nock = require("nock");
const sinon = require("sinon");
const assert = require("assert");

describe("Stream", () => {
    it("Should emit an error when downloading do", () => {
        return new Promise(function(resolve) {
            const transform = new Transform();
            sinon.stub(transform.httpClient, "get")
                .callsFake((chunk, cb) => {
                    cb(new Error("dummy"));
                });
            const input = new PassThrough();
            input.pipe(transform)
                .on("error", function() {
                    resolve();
                });
            input.write("http://example.com");
        });

    });

    it("Should use construct httpClient", () => {
        const transform = new Transform({
            httpClient: "foo"
        });
        assert.equal(transform.httpClient, "foo");
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
            const transform = new Transform();
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
});
