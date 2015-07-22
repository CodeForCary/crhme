(function () {
   "use strict";

  var rp = require("request-promise"),
    cheerio = require("cheerio"),
    moment = require("moment"),
    pdfText = require('pdf-text'),
    fs = require ("fs"),
    _ = require("lodash"),
    q = require("q");

  require("stringformat").extendString("format");

  var geocoder = require("./geocoder");

  var service = (function (baseUrl) {
    if (typeof baseUrl !== "string") throw("baseUrl is not defined");

    var initUrl = "{0}/{1}".format(baseUrl, "dailybulletin.aspx"),
    	searchUrl = "{0}/{1}".format(baseUrl, "summary.aspx"),
    	jsonUrl = "{0}/{1}".format(baseUrl, "jqHandler.ashx?op=s");

    var cookieJar = rp.jar(),
      request = rp.defaults({ 
      proxy: process.env.CRHME_PROXY || null, 
      jar: cookieJar,
      rejectUnauthorized: false,
      followRedirect: true,
      followAllRedirects: true,
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

    var parameters = {};

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


    var connect = function () {
      var deferred = q.defer();
      request({
        method: "GET",
          uri: initUrl
        })
        .then(function (html) {
          parameters[initUrl] = getFormParams(html);
          parameters[initUrl]["MasterPage$mainContent$ddlType2"] = "AL";
          parameters[initUrl]["__EVENTTARGET"] = "MasterPage$mainContent$lbUpdate";
          parameters[initUrl]["__EVENTARGUMENT"] = "";
          deferred.resolve();
        }, deferred.reject)
        .catch(deferred.reject);
      return deferred.promise;
    },
    setDate = function (date) {
      var deferred = q.defer();
      parameters[initUrl]["MasterPage$mainContent$txtDate2"] = moment(date).format("MM/DD/YYYY");
      request({
        method: "POST",
        uri: initUrl,
        form: parameters[initUrl]
      }).then(deferred.resolve, deferred.reject);
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

      setDate(date).then(function () {
	      request({
	        method: "POST",
	        uri: jsonUrl,
	        form: query
	      })
	      .then(deferred.resolve, deferred.reject)
	      .catch(deferred.reject);
	  }, deferred.reject);

      return deferred.promise;
    },
    getPdf = function (caseNumber, date) {
      var deferred = q.defer();
      request({
        method: "GET",
          uri: searchUrl
        })
        .then(function (html) {
          parameters[searchUrl] = getFormParams(html);
          parameters[searchUrl]["__EVENTTARGET"] = "MasterPage$mainContent$cmdSubmit2";
          parameters[searchUrl]["__EVENTARGUMENT"] = "";
          parameters[searchUrl]["MasterPage$mainContent$txtCase2"] = caseNumber;
          delete(parameters[searchUrl]["MasterPage$mainContent$chkTA2"]); // = "on";
          delete(parameters[searchUrl]["MasterPage$mainContent$chkAR2"]); // = "on";
          parameters[searchUrl]["MasterPage$mainContent$chkLW2"] = "on";
          parameters[searchUrl]["MasterPage$mainContent$txtDateFrom2"] = moment(Date.parse(date + " ")).format("MM/DD/YYYY");
          parameters[searchUrl]["MasterPage$mainContent$txtDateTo2"] = moment(Date.parse(date + " ") + (86400000 * 2)).format("MM/DD/YYYY");
          request({
	        method: "POST",
	        uri: searchUrl,
	        form: parameters[searchUrl]
	      }).then(function (html) {
            var $ = cheerio.load(html),
            	reportElementId = "MasterPage$mainContent$gvSummary$ctl02$lbGetReport";
            if ($(reportElementId).length) {
	            parameters[searchUrl] = getFormParams(html);
	            parameters[searchUrl]["__EVENTTARGET"] = "MasterPage$mainContent$gvSummary$ctl02$lbGetReport";
	            parameters[searchUrl]["__EVENTARGUMENT"] = "";
	            request({
		          method: "POST",
		          uri: searchUrl,
		          form: parameters[searchUrl],
		          encoding: null
		        }).then(function (buffer) {
		        	if (buffer) deferred.resolve(buffer);
		        	else deferred.reject();
		        }, deferred.reject)
	            .catch(deferred.reject);
        	}
        	else {
        		deferred.reject();
        	}
	      }, deferred.reject)
          .catch(deferred.reject);
        }, deferred.reject)
        .catch(deferred.reject);
      return deferred.promise;
    };

    return {
      getPdf: getPdf,
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
                var idx = 0;
                var results = _.forEach(json.rows, function (item) {
                	getPdf(item.id, date)
					  .then(function (buffer) {
					  	var fixed = idx++;
					  	if (buffer) {
					  	  try { 
						  pdfText(buffer, function (err, chunks) {
						  	if (!err && chunks) {
					          item.location = chunks[202];
					          item.race = chunks[215];
					          item.sex = chunks[216];
					          item.property = chunks[203];
					          if (fixed === json.rows.length - 1) {
	                	        deferred.resolve(json);
					    	  }
					    	}
						  });
						}
						catch (ex) {
							deferred.resolve(json);
						}
						}
					}, function (error) {
						deferred.resolve(json);
					})
					.catch(function (error) {
						deferred.resolve(json);
					}); 
                });
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