(function(){
	var s = Gordon.readyStates,
		defaults = {
			id: null,
			width: 0,
			height: 0,
			autoplay: true,
			loop: true,
			quality: Gordon.qualityValues.HIGH,
			scale: Gordon.scaleValues.SHOW_ALL,
			bgcolor: null,
			renderer: null,
			onprogress: function(percent){},
			onreadystatechange: function(state){},
			onenterframe: function(frameNum){}
		};
	
	Gordon.Movie = function(url, options){
		var t = this;
		t.url = url;
		for(var prop in defaults){ t[prop] = undefined != options[prop] ? options[prop] : defaults[prop]; }
		if(!url){ throw new Error("URL of a SWF movie file must be passed as first argument"); }
		t._startTime = +new Date;
		t._readyState = s.UNINITIALIZED;
		t._changeReadyState(t._readyState);
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, false);
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = function(){
			if(xhr.readyState == 2){ t._changeReadyState(s.LOADING); }
		}
		xhr.send(null);
		if(200 != xhr.status){ throw new Error("Unable to load " + url + " status: " + xhr.status); }
		t._changeReadyState(s.LOADED);
		var d = t._dictionary = {},
			l = t._timeline = [];
		t._framesLoaded = 0;
		t._isPlaying = false;
		t._currFrame = -1;
		new Gordon.Parser(xhr.responseText, function(obj){
			switch(obj.type){
				case "header":
					for(var prop in obj){ t['_' + prop] = obj[prop]; }
					var f = t._frameSize,
						frmWidth = f.right - f.left,
						frmHeight = f.bottom - f.top;
					if(!(t.width && t.height)){
						t.width = frmWidth;
						t.height = frmHeight;
					}
					var r = t.renderer = t.renderer || Gordon.SvgRenderer;
					t._renderer = new r(t.width, t.height, frmWidth, frmHeight, t.quality, t.scale, t.bgcolor);
					break;
				case "frame":
					var bgcolor = obj.bgcolor;
					if(bgcolor && !t.bgcolor){
						t._renderer.setBgcolor(bgcolor);
						t.bgcolor = bgcolor;
					}
					var action = obj.action;
					if(action){ eval("obj.action = function(){ (" + action + "(t)); }"); }
					l.push(obj);
					var f = ++t._framesLoaded;
					t.onprogress(t.percentLoaded());
					if(f == 1){
						if(t.id){
							var stage = doc.getElementById(t.id);
							stage.innerHTML = '';
							stage.appendChild(t._renderer.getNode());
							t._changeReadyState(s.INTERACTIVE);
						}
						if(t.autoplay){ t.play(); }
						else{ t.gotoFrame(0); }
					}else if(f == t._frameCount){ t._changeReadyState(s.COMPLETE); }
					break;
				default:
					t._renderer.defineObject(obj);
					d[obj.id] = obj;
			}
		});
	};
	Gordon.Movie.prototype = {
		_changeReadyState: function(state){
			this._readyState = state;
			this.onreadystatechange(state);
			return this;
		},
		
		play: function(){
			var t = this,
				c = t._currFrame,
				timeout = 1100 / t._frameRate;
			t._isPlaying = true;
			if(c < t._frameCount - 1){
				if(t._framesLoaded >= c){ t.gotoFrame(c + 1); }
				else{ timeout = 0; }
			}else{
				if(!t.loop){ return t.stop(); }
				else{ t.gotoFrame(0); }
			}
			setTimeout(function(){
				if(t._isPlaying){ t.play() };
			}, timeout);
			return t;
		},
		
		nextFrame: function(){
			var t = this,
				c = t._currFrame;
			t.gotoFrame(c < t._frameCount - 1 ? c + 1 : 0);
			return t;
		},
		
		gotoFrame: function gf(frameNum){
			var t = this;
			if(gf.caller !== t.play){ t.stop(); }
			if(t._currFrame != frameNum){
				if(frameNum < t._currFrame){ t._currFrame = -1; }
				while(t._currFrame != frameNum){
					var frame = t._timeline[++t._currFrame],
						d = frame.displayList,
						r = t._renderer;
					for(var depth in d){
						var character = d[depth];
						if(character){ r.placeCharacter(character); }
						else{ r.removeCharacter(depth); }
					}
					t.onenterframe(frameNum);
					var action = frame.action;
					if(action){ action(); }
			    }
			}
			return t;
		},
		
		stop: function(){
			this._isPlaying = false;
			return this;
		},
		
		prevFrame: function(){
			var t = this,
				c = t._currFrame;
			t.gotoFrame(c > 0 ? c - 1 : t._frameCount - 1);
			return t;
		},
		
		isPlaying: function(){
			return this._isPlaying; 
		},
		
		rewind: function(){
			this.gotoFrame(0);
			return this;
		},
		
		totalFrames: function(){
			return this._frameCount;
		},
		
		percentLoaded: function(){
			return Math.round((this._framesLoaded * 100) / this._frameCount);
		},
		
		currentFrame: function(){
			return this._currFrame;
		},
		
		getURL: function(url, target){
			var u = Gordon.urlTargets;
			switch(target){
				case u.BLANK:
					global.open(url);
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
		
		toggleHighQuality: function thq(){
			var o = thq._orig,
				t = this,
				q = t.quality;
			if(o){
				q = t.quality = o;
				thq._orig = null;
			}else{ t.quality = thq._orig = q; }
			t._renderer.setQuality(q);
			return t;
		}
	};
}());
