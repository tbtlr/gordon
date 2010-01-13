/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var _g = Gordon = {};
	var _loadedUrls = {};
	
	var scripts = document.getElementsByTagName("script");
	var i = scripts.length;
	while(i--){
		var match = scripts[i].src.match(/(^|.*\/)gordon\.js$/);
		if(match){ _g.ROOT = match[1]; }
	}
	
	_g.xhr = function(){
		var request = new XMLHttpRequest();
		request.open.apply(request, arguments);
		return request;
	}
	
	_g.require = function(url){
		if(!url.match(/\.([^\/]*)$/)){ url += ".js"; }
		if(!_loadedUrls[url]){
			with(_g.xhr("GET", _g.ROOT + url, false)){
				send(null);
				if(status == 200){
					eval(responseText);
					_loadedUrls[url] = true;
				}
				else{ throw new Error("Unable to load " + url + " status: " + status); }
			}
		}
	}
})();

Gordon.require("src/_base");
Gordon.require("src/Movie");
