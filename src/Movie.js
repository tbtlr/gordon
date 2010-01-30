/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

Gordon.require("src/Stream");

(function(){
	var _g = Gordon;
	var _useJson = _g.USE_NATIVE_JSON;
	var _m = _g.movieStates;
	var _options = {
		id: null,
		name: null,
		width: 0,
		height: 0,
		autoplay: true,
		loop: true,
		quality: _g.scaleValues.HIGH,
		scale: _g.scaleValues.DEFAULT,
		bgcolor: null,
		renderer: null,
		onLoad: function(){},
		onEnterFrame: function(){}
	};
	
	_g.Movie = function(url, options){
		if(!url){ throw new Error("URL of a SWF movie file must be passed as first argument"); }
		var t = this;
		t._state = _m.LOADING;
		var xhr = _g.xhr("GET", url, false);
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.send(null);
		if(200 != xhr.status){ throw new Error("Unable to load " + url + " status: " + xhr.status); }
		var s = new _g.Stream(xhr.responseText);
		var signature = s.readString(3);
		var v = _g.validSignatures;
		if(signature != v.SWF && signature != v.COMPRESSED_SWF){ throw new Error(url + " is not a SWF movie file"); }
		t.url = url;
		for(var o in _options){ t[o] = undefined != options[o] ? options[o] : _options[o]; }
		t.stream = s;
		t.version = s.readUI8();
		t.fileLength = s.readUI32();
		if(signature == v.COMPRESSED_SWF){ s.decompress(); }
		var f = t.frameSize = s.readRect();
		t.frameRate = s.readUI16() / 256;
		t.frameCount = s.readUI16();
		var frameWidth = f.right - f.left;
		var frameHeight = f.bottom - f.top;
		if(!(t.width && t.height)){
			t.width = frameWidth;
			t.height = frameHeight;
		}
		t.currentFrame = 0;
		if(!t.renderer){
			Gordon.require("src/SvgRenderer");
			t.renderer = _g.SvgRenderer;
		}
		t._renderer = new t.renderer(t.width, t.height, frameWidth, frameHeight, t.quality, t.scale, t.bgcolor);
		var d = t._dictionary = {};
		var l = t._timeline = [];
		var parser = new Worker(_g.ROOT + "src/_parser.js");
		parser.onerror = function(){};
		parser.onmessage = function(e){
			var object = _useJson ? JSON.parse(e.data) : e.data;
			if("frame" == object.type){
				var bgcolor = object.bgcolor;
				if(bgcolor && !t.bgcolor){
					t._renderer.setBgcolor(bgcolor);
					t.bgcolor = bgcolor;
				}
				l.push(object);
				if(t.id && l.length == 1){
					var parent = document.getElementById(t.id);
					parent.innerHTML = '';
					parent.appendChild(t._renderer.getNode());
					t.goto(1);
					t.onLoad();
					if(t.autoplay){ t.play(); }
				}
			}else{
				t._renderer.defineObject(object);
				d[object.id] = object;
			}
			var action = object.action;
			if(action){ eval("object.action = function(){ (" + action + ")(t); }"); }
		};
		parser.postMessage(s.readString(s._length - s._offset));
		t._state = _m.LOADED;
	};
	_g.Movie.prototype = {
		play: function(){
			var t = this;
			if(t._state != _m.PLAYING){
				t._state = _m.PLAYING;
				var interval = setInterval(function(){
					if(t._state == _m.PLAYING){
						t.nextFrame();
						if(t.currentFrame == t.frameCount && !t.loop){ t.rewind(); }
					}else{ clearInterval(interval); }
				}, 1000 / t.frameRate);
			}
			return t;
		},
		
		stop: function(){
			this._state = _m.STOPPED;
			return this;
		},
		
		nextFrame: function(){
			var t = this;
			if(t.currentFrame == t.frameCount){ t.currentFrame = 0; }
			var frame = t._timeline[t.currentFrame];
			var r = t._renderer;
			if(frame){
				var displayList = frame.displayList;
				for(var depth in displayList){
					var character = displayList[depth];
					if(character){ r.placeCharacter(character); }
					else{ r.removeCharacter(depth); }
				}
				++t.currentFrame;
				var action = frame.action;
				if(action){ action(); }
				t.onEnterFrame();
			}
			return t;
		},
		
		prevFrame: function(){
			this.goto(this.currentFrame - 1);
			return this;
		},
		
		goto: function(frame){
			var t = this;
			if(frame < 0){ frame = t.frameCount + frame; }
			if(frame && frame <= t.frameCount && frame != t.currentFrame){
				while(t.currentFrame != frame){ t.nextFrame(); }
			}
			return t;
		},
		
		rewind: function(){
			this.stop();
			this.goto(1);
			return this;
		},
		
		getUrl: function(url, target){
			var u = _g.urlTargets;
			switch(target){
				case u.BLANK:
					window.open(url);
					break;
				case u.PARENT:
					parent.location.href = url;
					break;
				case u.TOP:
					top.location.href = url;
					break;
				default:
					location.href = url;
			}
			return this;
		},
		
		toggleQuality: function(){
			this._renderer.toggleQuality();
			return this;
		}
	};
})();
