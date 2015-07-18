(function () {
	"use strict";

	var service = require("./service"),
		converter = require("./converter");

	service.fetch.apply(service, process.argv.slice(2)).then(function (data) {
		console.log(typeof data);
		console.log("******** TRANSFORMING ********");
		var cgData = converter.transform(data, "citygram");
		console.log(JSON.stringify(cgData, null, 2));
	},
	function (reason) {
		console.log("Failed due to: " + reason);
	}).catch(function (error) {
		console.log("Failed due to: " + error.message + "\n" + error.stack);
	})
})();
