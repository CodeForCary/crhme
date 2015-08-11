(function() {
  "use strict";

  var DEBUG = true,
    DO_GEOCODE = false;

  var rp = require("request-promise"),
    cheerio = require("cheerio"),
    moment = require("moment"),
    pdfText = require('pdf-text'),
    fs = require("fs"),
    _ = require("lodash"),
    q = require("q");

  require("stringformat").extendString("format");

  var geocoder = require("./geocoder");

  var service = (function(baseUrl) {
    if (typeof baseUrl !== "string") throw ("baseUrl is not defined");

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

    var getFormParams = function(html) {
      var $ = cheerio.load(html),
        params = {};

      _.forEach($("form input"), function(element) {
        var key = element.attribs["name"];
        (typeof key === "string") && (params[key] = element.attribs["value"]);
      });

      return params;
    };


    var connect = function() {
        var deferred = q.defer();
        request({
            method: "GET",
            uri: initUrl
          })
          .then(function(html) {
            parameters[initUrl] = getFormParams(html);
            parameters[initUrl]["MasterPage$mainContent$ddlType2"] = "AL";
            parameters[initUrl]["__EVENTTARGET"] = "MasterPage$mainContent$lbUpdate";
            parameters[initUrl]["__EVENTARGUMENT"] = "";
            deferred.resolve();
          }, deferred.reject)
          .catch(deferred.reject);
        return deferred.promise;
      },
      setDate = function(date) {
        var deferred = q.defer();
        parameters[initUrl]["MasterPage$mainContent$txtDate2"] = moment(date).format("MM/DD/YYYY");
        request({
          method: "POST",
          uri: initUrl,
          form: parameters[initUrl]
        }).then(deferred.resolve, deferred.reject);
        return deferred.promise;
      },
      fetch = function(date) {
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

        setDate(date).then(function() {
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
      getPdf = function(caseNumber, date) {
        var deferred = q.defer();
        var cancel = _.bind(deferred.reject, deferred, [null]);
        request({
            method: "GET",
            uri: searchUrl
          })
          .then(function(html) {
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
              }).then(function(html) {
                  var $ = cheerio.load(html),
                    reportElementId = "mainContent_gvSummary_lbGetReport_0";
                  if ($("#" + reportElementId).length) {
                    parameters[searchUrl] = getFormParams(html);
                    parameters[searchUrl]["__EVENTTARGET"] = "MasterPage$mainContent$gvSummary$ctl02$lbGetReport";
                    parameters[searchUrl]["__EVENTARGUMENT"] = "";
                    request({
                        method: "POST",
                        uri: searchUrl,
                        form: parameters[searchUrl],
                        encoding: null
                      }).then(function(buffer) {
                        if (buffer) {
                          deferred.resolve({
                            id: caseNumber,
                            buffer: buffer
                          });
                        } else cancel();
                      }, cancel)
                      .catch(cancel);
                  } else {
                    cancel();
                  }
                },
                function(reason) {
                  console.log("REPORT FAILED: " + reason);
                  cancel();
                })
              .catch(cancel);
          }, cancel)
          .catch(cancel);
        return deferred.promise;
      },
      readPdf = function(caseNumber, buffer) {
        var deferred = q.defer();
        pdfText(buffer, function(err, chunks) {
          if (!err && chunks) {
            //fs.writeFileSync("./pdf/" + caseNumber + ".pdf.json", JSON.stringify(chunks, null, 2));
            var caseNumberIndex = _.findIndex((chunks || []), function(chunk) {
              var isCaseNumber = (chunk || "").replace(/\D/g, "").substring(0, 6) === String(caseNumber).substring(0, 6);
              return isCaseNumber;
            });
            if (caseNumberIndex === -1) {
              DEBUG && console.log(JSON.stringify(chunks, null, 2));
              throw (new Error("No chunk for: " + String(caseNumber)));
            }
            if (caseNumberIndex >= 0) {
              deferred.resolve({
                id: caseNumber,
                location: (function() {
                  var range = (chunks || []).slice(caseNumberIndex + 12, caseNumberIndex + 20);
                  return _.find(range, function(chunk) {
                    return chunk.indexOf("NC 275") !== -1;
                  });
                })(),
                race: chunks[215],
                sex: chunks[216],
                property: chunks[203]
              });
            } else {
              deferred.reject("Case Number " + caseNumber + " not found in JSON response.");
            }
          } else {
            deferred.reject(err);
          }
        });

        return deferred.promise;
      },
      geocodeAddress = function(caseNumber, address) {
        var deferred = q.defer();
        geocoder.getCoordinates(address).then(function(result) {
            if (result && result.lat && result.lng) {
              deferred.resolve({
                id: caseNumber,
                coordinates: [result.lat, result.lng]
              });
            } else {
              deferred.reject("No coordinates returned");
            }
          },
          deferred.reject);
        return deferred.promise;
      };

    return {
      getPdf: getPdf,
      fetch: function(date) {
        if (ready) {
          return fetch(date);
        } else {
          var deferred = q.defer();
          connect(date).then(function() {
            ready = true;
            fetch(date).then(function(response) {
              try {
                var text = response
                  .replace(/\\u0026nbsp\;/gi, "")
                  .replace(/\:\s?\"\,\s{0,1}/gi, ":\"")
                  .replace(/\:\s?\"\s{0,1}\"/gi, ":null");
                var json = JSON.parse(text);
                var incidents = _.filter(json.rows, function(row) {
                  return row.id && row.charge && row.key === "LW";
                });
                var reportPromises = _.map(incidents, function(incident) {
                  return getPdf(incident.id, date);
                });
                q.allSettled(reportPromises).then(function(results) {
                      var readPromises = _.map(_.where(results, {
                        state: "fulfilled"
                      }), function(result) {
                        try {
                          var parsed = readPdf(result.value.id, result.value.buffer);
                          DEBUG && console.log("Parsed PDF for " + result.value.id);
                          return parsed;
                        }
                        catch (ex) {
                          DEBUG && console.log("FAILED to parse PDF for " + result.value.id);
                          return null;
                        }
                      });
                      q.allSettled(readPromises).then(function(results) {
                        _.forEach(results, function(result) {
                          try {
                            var data = result.value;
                            if (data) {
                              _.forEach(_.omit(Object.keys(data), "id"), function(key) {
                                _.forEach(_.where(incidents, {
                                  id: data.id
                                }), function(incident) {
                                  incident[key] = data[key];
                                });
                              });
                            }
                          }
                          catch (ex) {
                            DEBUG && console.log("FAILED to assign PDF values for " + result.value.id);
                          }
                        });

                        if (DO_GEOCODE) {
                          var geocodePromises = _.map(incidents, function(incident) {
                            return geocodeAddress(incident.id, incident.location);
                          });
                          q.allSettled(geocodePromises).then(function(results) {
                            _.forEach(results, function(result) {
                              if (result && result.value) {
                                _.forEach(_.where(incidents, {
                                  id: result.value.id
                                }), function(incident) {
                                  incident.coordinates = result.value.coordinates;
                                });
                              }
                            });

                            DEBUG && console.log("Resolving with geocoding for " + incidents.length + " incidents");

                            deferred.resolve({
                              rows: incidents
                            });
                          },
                          function(reason) {
                            console.log("ERROR5! " + ex.message);
                            deferred.reject(reason);
                          })
                          .catch(function(ex) {
                            console.log("ERROR6! " + ex.message);
                            deferred.reject(ex.message);
                          });
                        }
                        else {
                          DEBUG && console.log("Resolving WITHOUT geocoding for " + incidents.length + " incidents");
                          deferred.resolve({
                            rows: incidents
                          });
                        }
                      });
                    },
                    function(reason) {
                      console.log("ERROR11! " + reason);
                      deferred.reject(reason);
                    })
                  .catch(function(ex) {
                    console.log("ERROR4! " + ex.message);
                    deferred.reject();
                  });
              } catch (ex) {
                console.log("ERROR12! " + ex.message);
                deferred.reject("Cannot parse response as JSON: " + ex.message);
              }
            },
            function(reason) {
              console.log("ERROR13! " + reason);
              deferred.reject(reason);
            });
          });
          return deferred.promise;
        }
      }
    };
  })("http://policereports.townofcary.org");

  module.exports = service;
})();