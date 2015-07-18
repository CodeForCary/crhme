(function () {
   "use strict";

    var rp = require("request-promise"),
		_ = require("lodash"),
		q = require("q");

	require("stringformat").extendString("format");

	var geocoder = (function (baseUrl) {

		return {
			getCoordinates: function (address) {
				var deferred = q.defer();
				return deferred.promise;
			}
		};
	})("");

	module.exports = geocoder;
})();