"use strict";
const path = require("path");
module.exports = {
    "Stream": require(path.join(__dirname, "stream")),
    "HttpError": require(path.join(__dirname, "errors", "http"))
};
