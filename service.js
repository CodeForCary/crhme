(function () {
   "use strict";

    var rp = require("request-promise"),
		cheerio = require("cheerio"),
		moment = require("moment"),
        fs = require ("fs"),
		_ = require("lodash"),
		q = require("q");

	require("stringformat").extendString("format");

	var service = (function (baseUrl) {
		if (typeof baseUrl !== "string") throw("baseUrl is not defined");

		var initUrl = "{0}/{1}".format(baseUrl, "dailybulletin.aspx");

		var cookieJar = rp.jar(),
		    request = rp.defaults({ 
				proxy: process.env.CRHME_PROXY || null, 
				jar: cookieJar,
				rejectUnauthorized: false,
				headers: {
					"accept": "application/json, text/javascript, */*",
					"user-agent": "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)",
					"dnt": "1",
					"accept-language": "en-US,en;q=0.8",
					"x-requested-with": "XMLHttpRequest",
					"content-type": "application/x-www-form-urlencoded",
					"connection": "keep-alive",
					"origin": baseUrl,
					"referer": initUrl
				}
			});

		var ready = false;

		var getFormParams = function (html) {
			var $ = cheerio.load(html),
			    params = {};

			_.forEach($("form input"), function (element) {
				var key = element.attribs["name"];
				(typeof key === "string") && (params[key] = element.attribs["value"]);
			});

			return params;
		};


		var connect = function (date) {
				var deferred = q.defer();

				if (typeof(date) === "string") {
					date = Date.parse(date + " ");
				}

				request({
					    method: "GET",
					    uri: initUrl
					})
					.then(function (html) {
						var params = getFormParams(html);
						params["MasterPage$mainContent$txtDate2"] = moment(date).format("MM/DD/YYYY");						
						params["MasterPage$mainContent$ddlType2"] = "AL";
						params["__EVENTTARGET"] = "MasterPage$mainContent$lbUpdate";
						params["__EVENTARGUMENT"] = "";

						request({
						    method: "POST",
						    uri: initUrl,
						    form: params
						}).then(function () {
							deferred.resolve();
						}, function () {
							deferred.resolve();
						});
					}, deferred.reject)
				    .catch(deferred.reject);
				return deferred.promise;
			},
			fetch = function (date) {
				var deferred = q.defer();

				if (typeof date === "string") {
					date = Date.parse(date + " ");
				}

				var query = {
					"t": "db",
					"_search": true,
					"nd": date.valueOf(),
					"rows": 10000,
					"page": 1,
					"sidx": "case",
					"sord": "asc"
				};

				request({
				    method: "POST",
				    uri: "{0}/{1}".format(baseUrl, "jqHandler.ashx?op=s"),
				    form: query
				})
				.then(deferred.resolve, deferred.reject)
			    .catch(deferred.reject);

				return deferred.promise;
			};

		return {
			fetch: function (date) {
				if (ready) {
					return fetch(date);
				}
				else {
					var deferred = q.defer();
					connect(date).then(function () {
						ready = true;
						fetch(date).then(function (response) {
							try {
								var text = response
									.replace(/\\u0026nbsp\;/gi, "")
									.replace(/\:\s?\"\,\s{0,1}/gi, ":\"")
									.replace(/\:\s?\"\s{0,1}\"/gi, ":null");
								var json = JSON.parse(text);
								deferred.resolve(json);
							}
							catch (ex) {
								deferred.reject("Cannot parse response as JSON");
							}
						}, deferred.reject);
					});
					return deferred.promise;
				}
			}
		};
	})("http://policereports.townofcary.org");

	module.exports = service;
})();