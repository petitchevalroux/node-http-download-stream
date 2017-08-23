"use strict";
const Error = require("@petitchevalroux/error");
class HttpError extends Error {
    constructor(err) {
        super(err);
        if (err && typeof(err) === "object") {
            Object.assign(this, err);
        }
    }
}

module.exports = HttpError;
