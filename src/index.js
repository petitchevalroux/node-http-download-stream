"use strict";
const path = require("path");
module.exports = {
    "Transform": require(path.join(__dirname, "stream")),
    "HttpError": require(path.join(__dirname, "errors", "http"))
};
