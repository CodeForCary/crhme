(function () {
 "use strict";

  var rp = require("request-promise"),
    _ = require("lodash"),
    q = require("q");

  require("stringformat").extendString("format");

  var geocoder = (function (baseUrl) {

    return {
      getCoordinates: function (address) {
      	if (typeof address === "string") {
	        address = address.replace(/[^\w\d\s\.\#\,]/g, "").replace(/\s+/g, " ");
	    }
	    else {
	    	throw(new Error("Invalid address argument - must be a string"));
	    }

        var deferred = q.defer();

        request({
	        method: "POST",
	        uri: "{0}?sensor=false&address={1}".format(baseUrl, encodeURIComponent(address)),
	        form: parameters[searchUrl]
	      }).then(function (json) {
	      	try {
                var json = JSON.parse(response);
                if (json && json.results && json.results.geometry && json.results.geometry.location) {
                	deferred.resolve(json.results.geometry.location);
                }
                else {
                	deferred.reject("Unexpected JSON response format: results.geometry.location not found");
                }
              }
              catch (ex) {
                deferred.reject("Cannot parse response as JSON");
              }
	      }, deferred.reject)
	      .catch(deferred.reject);

        return deferred.promise;
      }
    };
  })("http://www.datasciencetoolkit.org/maps/api/geocode/json");

  module.exports = geocoder;
})();