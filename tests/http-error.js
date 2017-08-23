"use strict";
const path = require("path"),
    {
        HttpError
    } = require(path.join(__dirname, "..", "src")),


    assert = require("assert");

describe("Http Errors", () => {
    it("Should copy error properties", () => {
        const error = new Error("foo");
        error.code = 42;
        const httpError = new HttpError(error);
        assert.equal(httpError.code, 42);
    });
});
