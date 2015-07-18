(function () {
   "use strict";

    var moment = require("moment"),
		_ = require("lodash");

	require("stringformat").extendString("format");

	var defaultTransformer = "citygram";

	var check = function (result) {
		if (!(result && result.rows && Array.isArray(result.rows))) {
			throw(new Error("Invalid result object"));
		}
		return true;
	};

	String.prototype.toTitleCase = function () {
    	return this.replace(/\w\S*/g, function (text) {
    		return text.charAt(0).toUpperCase() + text.substr(1).toLowerCase();
    	});
	};

	RegExp.prototype.firstMatch = function (text) {
		var matches = (text || "").match(this);
		if (!matches) {
			console.log(text + " <> " + this.toString());
		}
		return (matches && matches.length) ? matches[0] : undefined;
	};

	var extrude = {
		"date": function (text) {
			var match = /(\d{1,2}\/\d{1,2}\/\d{4})/.firstMatch(text);
			return (match) ? moment(Date.parse(match)).format("YYYY-MM-DD") : null;
		},
		"time": function (text) {
			var match = /(\d{1,2}\:\d{2}\:\d{2}\s?[AP]M)/i.firstMatch(text);
			return (match) ? moment(Date.parse("1/1/1970 " + match)).format("HH:mm:ss.000") : null;
		}
	};

	var transforms = {
		"citygram": function (result) {
			var entitle = function (record, datetime) {
				var template = "A crime incident happened near you on {0} at {1}. " +
					"The Cary Police described it as {2}",
					when = moment(Date.parse(datetime.replace("T", " ") + " "));
				return template.format(when.format("ddd MMM D"),
					when.format("h:mm A"), 
					(record.charge || record.crime).toTitleCase());
			};

			console.log(result.rows.length);

			var transformed = _.map(result.rows, function (row) {
				var datetime = extrude.date(row.time) + "T" + 
						(extrude.time(row.time) || "00:00:00.000"),
					location = {
						type: "Point",
						coordinates: []
					};

				console.log(".");

				return {
					id: "Cary_" + row.id,
					datetime: datetime,
					type: "Crime Alert",
					properties: {
						inc_datetime: datetime,
						inc_no: row.id,
						lcr_desc: row.charge,
						location: location,
						datasetid: "Cary Police Report",
						title: entitle(row, datetime)
					},
					geometry: location
				};
			});

			return transformed;
		}
	}

	var converter = (function () {
		return {
			transform: function (result, transformer) {
				var transformed = null;
				if (check(result)) {
					var method = transforms[transformer || defaultTransformer];
					if (typeof method !== "function") {
						throw(new Error("Invalid transformer: " + String(transformer)));
					}
					transformed = method(result);
				}
				return transformed;
			}
		};
	})();

	module.exports = converter;
})();