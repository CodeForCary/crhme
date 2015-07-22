var service = require('./service');
var pdfText = require('pdf-text');

var pathToPdf = "./pdf/PoliceReport.pdf";

var rp = require("request-promise");
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
        "origin": "http://policereports.townofcary.org",
        "referer": "http://policereports.townofcary.org"
      }
    });

pdfText(pathToPdf, function(err, chunks) {
  //chunks is an array of strings 
  //loosely corresponding to text objects within the pdf

  //for a more concrete example, view the test file in this repo
  ///console.log(chunks);
});

service.getPdf(15006069)
	.then(function (buffer) {
		//console.log(buffer);
	  pdfText(buffer, function(err, chunks) {
	  	console.log(err);
	  	console.log(chunks);
		})
	}, function (error) {});

//or parse a buffer of pdf data
//this is handy when you already have the pdf in memory
//and don't want to write it to a temp file
//var fs = require('fs');
//var buffer = fs.readFileSync(pathToPdf);
