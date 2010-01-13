/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

Gordon.require("src/base64");
Gordon.require("src/Color");
Gordon.require("src/Cxform");
Gordon.require("src/Matrix");
Gordon.require("src/Stream");

(function(){
	var _g = Gordon;
	var _m = _g.movieStates;
	var _t2p = _g.twips2px;
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
		onLoad: null,
		onEnterFrame: null
	};
	
	_g.Movie = function(url, options){
		if(!url){ throw new Error("URL of a SWF movie file must be passed as first argument"); }
		var t = this;
		t._state = _m.LOADING;
		var s = new _g.Stream(url);
		var signature = s.readString(3);
		var g = _g.signatures;
		if(signature != g.SWF && signature != g.COMPRESSED_SWF){ throw new Error(url + " is not a SWF movie file"); }
		t.url = url;
		for(var o in _options){ t[o] = options[o] != undefined ? options[o] : _options[o]; }
		t.stream = s;
		t.version = s.readUI8();
		t.fileLength = s.readUI32();
		if(signature == g.COMPRESSED_SWF){ s.decompress(); }
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
		t._renderer = new this.renderer(t.width, t.height, frameWidth, frameHeight, t.quality, t.scale, t.bgcolor);
		t._tagsOffset = s.tell();
		t._dictionary = {};
		t._jpegTables = null;
		t._frameActions = {};
		var i = t.frameCount;
		while(i--){ t.nextFrame(); }
		t.reset();
		if(t.id){
			var parent = document.getElementById(t.id);
			parent.innerHTML = '';
			parent.appendChild(t._renderer.getNode());
		}
		t._state = _m.LOADED;
		if(t.onLoad){ t.onLoad(); }
		if(t.autoplay){ t.play(); }
	};
	_g.Movie.prototype = {
		play: function(){
			var t = this;
			if(t._state != _m.PLAYING){
				t._state = _m.PLAYING;
				var interval = setInterval(function(){
					if(t._state == _m.PLAYING){
						t.nextFrame();
						if(t.currentFrame == t.frameCount && !t.loop){ t.stop(); }
					} else { clearInterval(interval); }
				}, 1000 / t.frameRate);
				return t;
			}
		},
		
		stop: function(){
			this._state = _m.STOPPED;
			return this;
		},
		
		nextFrame: function(){
			var t = this;
			if(t.currentFrame == t.frameCount){ t.reset(); }
			var s = t.stream;
			do{
				var header = s.readUI16();
			  	var code = header >> 6;
			  	var length = header & 0x3f;
			    if(length >= 0x3f){ length = s.readUI32(); }
				var handler = _g.tagHandlerMap[code];
				if(typeof t[handler] == "function"){ t[handler](s.tell(), length); }
				else { s.seek(length); }
			}while(code && code != _g.tagCodes.SHOW_FRAME);
			if(t.onEnterFrame){ t.onEnterFrame(); }
			return t;
		},
		
		_handleShowFrame: function(){
			this.currentFrame++;
			return this;
		},
		
		_handleDefineShape: function(offset, length){
			var t = this;
			var s = t.stream;
			var id = s.readUI16();
			var d = t._dictionary;
			if(!d[id]){
				var bounds = s.readRect();
				var fillStyles = t._readFillStyleArray();
				var lineStyles = t._readLineStyleArray();
				var numFillBits = s.readUB(4);
				var numLineBits = s.readUB(4);
				var x1 = 0;
				var y1 = 0;
				var x2 = 0;
				var y2 = 0;
				var segment = [];
				var isFirst = true;
				var edges = [];
				var leftFill = 0;
				var rightFill = 0;
				var line = 0;
				var fsOffset = 0;
				var lsOffset = 0;
				var leftFillEdges = {};
				var rightFillEdges = {};
				var lineEdges = {};
				var c = _g.styleChangeStates;
				var countFillChanges = 0;
				var countLineChanges = 0;
				var useSinglePath = true;
				var i = 0;
				do{
					var type = s.readUB(1);
					var flags = null;
					if(type){
						var isStraight = s.readBool();
						var numBits = s.readUB(4) + 2;
						x1 = x2, y1 = y2;
						var cx = null;
						var cy = null;
						if(isStraight){
							var isGeneral = s.readBool();
							if(isGeneral){
								x2 += _t2p(s.readSB(numBits));
								y2 += _t2p(s.readSB(numBits));
							}
							else{
								var isVertical = s.readBool();
				  	  			if(isVertical){ y2 += _t2p(s.readSB(numBits)); }
				  	  			else{ x2 += _t2p(s.readSB(numBits)); }
				  	  		}
						}else{
							cx = x1 + _t2p(s.readSB(numBits));
							cy = y1 + _t2p(s.readSB(numBits));
							x2 = cx + _t2p(s.readSB(numBits));
							y2 = cy + _t2p(s.readSB(numBits));
						}
						x2 = Math.round(x2 * 100) / 100;
						y2 = Math.round(y2 * 100) / 100;
						segment.push({
							i: i++,
							f: isFirst,
							x1: x1,
							y1: y1,
							cx: cx,
							cy: cy,
							x2: x2,
							y2: y2
						});
						isFirst = false;
					}else{
						isFirst = true;
						if(segment.length){
							edges.push.apply(edges, segment);
							if(leftFill){
								var index = fsOffset + leftFill;
								var list = leftFillEdges[index];
								if(!list){ list = leftFillEdges[index] = []; }
								for(j = 0; segment[j]; j++){
									var edge = _cloneEdge(segment[j]);
									edge.i = i++;
									var tx1 = edge.x1;
									var ty1 = edge.y1;
									edge.x1 = edge.x2;
									edge.y1 = edge.y2;
									edge.x2 = tx1;
									edge.y2 = ty1;
									list.push(edge);
								}
							}
							if(rightFill){
								var index = fsOffset + rightFill;
								var list = rightFillEdges[index];
								if(!list){ list = rightFillEdges[index] = []; }
								list.push.apply(list, segment);
							}
							if(line){
								var index = lsOffset + line;
								var list = lineEdges[index];
								if(!list){ list = lineEdges[index] = []; }
								list.push.apply(list, segment);
							}
							segment = [];
						}
						var flags = s.readUB(5);
						if(flags){
							if(flags & c.MOVE_TO){
								var numBits = s.readUB(5);
			    		  		x2 = _t2p(s.readSB(numBits));
								y2 = _t2p(s.readSB(numBits));
					  	  	}
					  	  	if(flags & c.LEFT_FILL_STYLE){
								leftFill = s.readUB(numFillBits);
								countFillChanges++;
							}
					  	  	if(flags & c.RIGHT_FILL_STYLE){
								rightFill = s.readUB(numFillBits);
								countFillChanges++;
							}
							if(flags & c.LINE_STYLE){
								line = s.readUB(numLineBits);
								countLineChanges++;
							}
							if((leftFill && rightFill) || (countFillChanges + countLineChanges) > 2){
								useSinglePath = false;
							}
					  	  	if(flags & c.NEW_STYLES){
						 		fillStyles.push.apply(fillStyles, t._readFillStyleArray());
								lineStyles.push.apply(lineStyles, t._readLineStyleArray());
								numFillBits = s.readUB(4);
								numLineBits = s.readUB(4);
								fsOffset = fillStyles.length;
								lsOffset = lineStyles.length;
								useSinglePath = false;
							}
						}
					}
				}while(type || flags);
				s.align();
				if(useSinglePath){
					var fill = leftFill || rightFill;
					var fillStyle = fill ? fillStyles[fsOffset + fill - 1] : null;
					var lineStyle = lineStyles[lsOffset + line - 1];
					d[id] = _buildShape(id, edges, fillStyle, lineStyle);
				}
				else{
					var fillShapes = [];
					var i = fillStyles.length;
					while(i--){
						var fill = i + 1;
						fillEdges = [];
						var list = leftFillEdges[fill];
						if(list){ fillEdges.push.apply(fillEdges, list); }
						list = rightFillEdges[fill];
						if(list){ fillEdges.push.apply(fillEdges, list); }
						var edgeMap = {};
						for(var j = 0; fillEdges[j]; j++){
							var edge = fillEdges[j];
							var key = _calcPointKey(edge.x1, edge.y1);
							var list = edgeMap[key];
							if(!list){ list = edgeMap[key] = []; }
							list.push(edge);
						}
						var pathEdges = [];
						var countFillEdges = fillEdges.length;
						for(var j = 0; j < countFillEdges && !pathEdges[countFillEdges - 1]; j++){
							var edge = fillEdges[j];
							if(!edge.c){
								var firstKey = _calcPointKey(edge.x1, edge.y1);
								var segment = [];
								var isUsed = {};
								do{
									segment.push(edge);
									isUsed[edge.i] = true;
									var key = _calcPointKey(edge.x2, edge.y2);
									if(key == firstKey){
										var k = segment.length;
										while(k--){ segment[k].c = true; }
										pathEdges.push.apply(pathEdges, segment);
										break;
									}
									var list = edgeMap[key];
									var favEdge = fillEdges[j + 1];
									var nextEdge = null;
									for(var k = 0; list[k]; k++){
										var entry = list[k];
								  		if(entry == favEdge && !entry.c){
								  			list.splice(k, 1);
								  			nextEdge = entry;
								  		}
								  	}
									if(!nextEdge){
								  		for(var k = 0; list[k]; k++){
								  			var entry = list[k];
								  			if(!(entry.c || isUsed[entry.i])){ nextEdge = entry; }
								  		}
									}
								}while(edge = nextEdge);
							}
						}
						if(pathEdges.length){
							var shape = _buildShape(id, pathEdges, fillStyles[i]);
							shape.index = pathEdges[pathEdges.length - 1].i;
							fillShapes.push(shape);
						}
					}
					var strokeShapes = [];
					var i = lineStyles.length;
					while(i--){
						var pathEdges = lineEdges[i + 1];
						var shape = _buildShape(id, pathEdges, null, lineStyles[i]);
						shape.index = pathEdges[pathEdges.length - 1].i;
						strokeShapes.push(shape);
					}
					var segments = fillShapes.concat(strokeShapes);
					segments.sort(function(a, b){
						return a.index - b.index;
					});
					d[id] = segments.length > 1 ? {
						type: "shape",
						id: id,
						segments: segments
					} : segments[0];
				}
			}else{ s.seek(length - 2); }
			return t;
		},
		
		_readFillStyleArray: function(){
			var s = this.stream;
			var numStyles = s.readUI8();
			if(numStyles == 0xff){ numStyles = s.readUI16(); }
			var styles = [];
			var i = numStyles;
			while(i--){
				var type = s.readUI8();
				var f = _g.fillStyleTypes;
				switch(type){
					case f.SOLID:
						styles.push(new Gordon.Color(s.readRgb()));
						break;
					case f.LINEAR_GRADIENT:
					case f.RADIAL_GRADIENT:
						var style = {type: type == f.LINEAR_GRADIENT ? "linear" : "radial"};
						style.matrix = new Gordon.Matrix(s.readMatrix());
						style.spread = s.readUB(2);
						style.interpolation = s.readUB(2);
						var numStops = s.readUB(4);
						var stops = style.stops = [];
						var j = numStops;
						while(j--){ stops.push({
							offset: s.readUI8() / 255,
							color: new Gordon.Color(s.readRgb())
						}); }
						styles.push(style);
						break;
					case f.REPEATING_BITMAP:
					case f.CLIPPED_BITMAP:
						var style = {type: "pattern"};
						var imgId = s.readUI16();
						var matrix = style.matrix = new Gordon.Matrix(s.readMatrix());
						var img = style.image = this._dictionary[imgId];
						if(img){
							with(matrix){
								scaleX = _t2p(scaleX);
								scaleY = _t2p(scaleY);
								skewX = _t2p(skewX);
								skewY = _t2p(skewY);
							}
							styles.push(style);
						}else{ styles.push(null); }
						break;
				}
			}
			return styles;
		},
		
		_readLineStyleArray: function(){
			var s = this.stream;
			var numStyles = s.readUI8();
			if(numStyles == 0xff){ numStyles = s.readUI16(); }
			var styles = [];
			var i = numStyles;
			while(i--){ styles.push({
				width: _t2p(s.readUI16()),
				color: new Gordon.Color(s.readRgb())
			}); }
			return styles;
		},
		
		_handlePlaceObject: function(offset, length){
			var character = {};
			var t = this;
			var s = t.stream;
			var id = s.readUI16();
			character.object = t._dictionary[id];
			character.depth = s.readUI16();
			character.matrix = new Gordon.Matrix(s.readMatrix());
			character.cxform = s.tell() - offset == length ? null : new Gordon.Cxform(s.readCxform());
			t._renderer[(t._state == _m.LOADING ? "define" : "place") + "Character"](character);
			return t;
		},
		
		_handleRemoveObject: function(){
			var t = this;
			var s = t.stream;
			var id = s.readUI16();
			var depth = s.readUI16();
			if(t._state != _m.LOADING){ t._renderer.removeCharacter({depth: depth}); }
			return t;
		},
		
		_handleDefineBits: function(offset, length){
			var t = this;
			var s = t.stream;
			var id = s.readUI16();
			var d = t._dictionary;
			if(!d[id]){
				var img = d[id] = {
					type: "image",
					id: id
				};
				var data = s.seek(2).readString(length - 4);
				var i = 0;
				do{
					var highByte = data.charCodeAt(i);
					var lowByte = data.charCodeAt(i + 1);
					i += 2;
				}while(!(highByte == 0xff && (lowByte == 0xc0 || lowByte == 0xc2)));
				var header = t._jpegTables.substr(0, t._jpegTables.length - 2);
				img.data = "data:image/jpeg;base64," + base64encode(header + data);
				img.width = (data.charCodeAt(i + 5) << 8) | data.charCodeAt(i + 6);
				img.height = (data.charCodeAt(i + 3) << 8) | data.charCodeAt(i + 4);
			}else{ s.seek(length - 2); }
			return t;
		},
		
		_handleDefineButton: function(offset, length){
			var t = this;
			var s = t.stream;
			var id = s.readUI16();
			var d = t._dictionary;
			if(!d[id]){
				var button = d[id] = {
					type: "button",
					id: id
				};
				var states = button.states = {};
				do{
					var flags = s.readUI8();
					if(flags){
						var objId = s.readUI16();
						var character = {object: d[objId]};
						var depth = character.depth = s.readUI16();
						character.matrix = new Gordon.Matrix(s.readMatrix());
						var state = 0x01;
						while(state <= 0x08){
							if(flags & state){
								var list = states[state];
								if(!list){ list = states[state] = {}; }
								list[depth] = character;
							}
							state <<= 1;
						}
					}
				}while(flags);
				button.onClick = t._readAction();
			}else{ s.seek(length - 2); }
			return t;
		},
		
		_readAction: function(){
			var t = this;
			var s = t.stream;
			var actions = [];
			do{
				var code = s.readUI8();
				var length = code > 0x80 ? s.readUI16() : 0;
				var a = _g.actionCodes;
				switch(code){
					case a.PLAY:
						actions.push("t.play()");
						break;
					case a.STOP:
						actions.push("t.stop()");
						break;
					case a.NEXT_FRAME:
						actions.push("t.nextFrame()");
						break;
					case a.PREVIOUS_FRAME:
						actions.push("t.prevFrame()");
						break;
					case a.GOTO_FRAME:
						var frame = s.readUI16();
						actions.push("t.goto(" + frame + ')');
						break;
					case a.GET_URL:
						var url = s.readString();
						var target = s.readString();
						actions.push("_getUrl('" + url + "', '" + target + "')");
						break;
					case a.TOGGLE_QUALITY:
						actions.push("t._renderer.toggleQuality()");
						break;
				}
			}while(code);
			eval("var action = function(){" + actions.join(';') + "}");
			return action;
		},
		
		_handleJpegTables: function(offset, length){
			var t = this;
			var s = t.stream;
			if(!t._jpegTables){ t._jpegTables = s.readString(length); }
			else{ s.seek(length); }
			return t;
		},
		
		_handleSetBackgroundColor: function(){
			this._renderer.setBgcolor(this.stream.readRgb());
			return this;
		},
		
		_handleDefineFont: function(offset, length){
			var t = this;
			var s = t.stream;
			var id = s.readUI16();
			var d = t._dictionary;
			if(!d[id]){
				var font = d[id] = {
					type: "font",
					id: id
				};
				var offsets = [];
				var numGlyphs = 0;
				var i = 0;
				do{
					var offset = s.readUI16();
					offsets.push(offset);
					if(!i){ i = numGlyphs = offset / 2; }
				}while(--i);
				var c = _g.styleChangeStates;
				var glyphs = font.glyphs = [];
				var i = numGlyphs;
				while(i--){
					var numFillBits = s.readUB(4);
					var numLineBits = s.readUB(4);
					var x = 0;
					var y = 0;
					var commands = [];
					do{
						var type = s.readUB(1);
						var flags = null;
						if(type){
							var isStraight = s.readBool();
							var numBits = s.readUB(4) + 2;
							if(isStraight){
								var isGeneral = s.readBool();
								if(isGeneral){
									x += s.readSB(numBits);
									y += s.readSB(numBits);
									commands.push('L', x, y);
								}else{
									var isVertical = s.readBool();
					  	  			if(isVertical){
										y += s.readSB(numBits);
										commands.push('V', y);
									}
					  	  			else{
										x += s.readSB(numBits);
										commands.push('H', x);
									}
					  	  		}
							}else{
								var cx = x + s.readSB(numBits);
								var cy = y + s.readSB(numBits);
								x = cx + s.readSB(numBits);
								y = cy + s.readSB(numBits);
								commands.push('Q', cx, cy, x, y);
							}
						}else{
							var flags = s.readUB(5);
							if(flags){
								if(flags & c.MOVE_TO){
									var numBits = s.readUB(5);
					    	  		x = s.readSB(numBits);
									y = s.readSB(numBits);
									commands.push('M', x, y);
						  	  	}
							  	if(flags & c.LEFT_FILL_STYLE || flags & c.RIGHT_FILL_STYLE){ s.readUB(numFillBits); }
							}
						}
					}while(type || flags);
					s.align();
					glyphs.push({commands: commands});
				}
			}else{ s.seek(length - 2); }
			return t;
		},
		
		_handleDefineText: function(offset, length){
			var s = this.stream;
			var id = s.readUI16();
			var d = this._dictionary;
			if(!d[id]){
				var text = d[id] = {
					type: "text",
					id: id
				};
				var bounds = s.readRect();
				text.matrix = new Gordon.Matrix(s.readMatrix());
				var numGlyphBits = s.readUI8();
				var numAdvBits = s.readUI8();
				var font = null;
				var fill = null;
				var x = 0;
				var y = 0;
				var size = 0;
				var string = null;
				var strings = text.strings = [];
				do{
					var header = s.readUB(8);
					if(header){
						var type = header >> 7;
						if(type){
							var flags = header & 0x0f;
							if(flags){
								var string = {};
								var t = _g.textStyleFlags;
								if(flags & t.HAS_FONT){
									var fontId = s.readUI16();
									font = d[fontId];
								}
								if(flags & t.HAS_COLOR){ fill = new Gordon.Color(s.readRgb()); }
								if(flags & t.HAS_XOFFSET){ x = _t2p(s.readSI16()); }
								if(flags & t.HAS_YOFFSET){ y = _t2p(s.readSI16()); }
								if(flags & t.HAS_FONT){ size = _t2p(s.readUI16()); }
							}
							string = {
								font: font,
								size: size,
								fill: fill,
								x: x,
								y: y
							};
							strings.push(string);
						}else{
							var numGlyphs = header & 0x7f;
							var entries = string.entries = [];
							var i = numGlyphs;
							while(i--){
								var entry = {};
								entry.index = s.readUB(numGlyphBits);
								entry.advance = _t2p(s.readSB(numAdvBits));
								entries.push(entry);
							}
							s.align();
						}
					}
				}while(header);
			}else{ s.seek(length - 2); }
			return this;
		},
		
		_handleDoAction: function(offset, length){
			var t = this;
			var s = t.stream;
			var action = t._frameActions[t.currentFrame];
			if(action){ s.seek(length); }
			else{ action = t._frameActions[t.currentFrame] = t._readAction(); }
			if(t._state != _m.LOADING){ action(); }
			return t;
		},
		
		_handleDefineFontInfo: function(offset, length){
			var t = this;
			var s = t.stream;
			var fontId = s.readUI16();
			var font = t._dictionary[fontId];
			if(!font.info){
				var f = font.info = {};
				f.name = s.readString(s.readUI8());
				f.isSmall = s.readBool(3);
				f.isShiftJis = s.readBool();
				f.isAnsi = s.readBool();
				f.isItalic = s.readBool();
				f.isBold = s.readBool();
				var useWideCodes = s.readBool();
				var codes = f.codes = [];
				var i = font.glyphs.length;
				while(i--){
					var code = useWideCodes ? s.readUI16() : s.readUI8();
					codes.push(code);
				}
			}else{ s.seek(length - 2); }
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
				if(frame < t.currentFrame){ t.reset(); }
				while(t.currentFrame != frame){ t.nextFrame(); }
			}
			return t;
		},
		
		reset: function(){
			var t = this;
			t._renderer.reset();
			var s = t.stream;
			s.reset();
			s.seek(t._tagsOffset, true);
			t.currentFrame = 0;
			return t;
		},
		
		rewind: function(){
			this.stop();
			this.reset();
			return this;
		}
	};
	
	function _cloneEdge(edge){
		return {
			i: edge.i,
			f: edge.f,
			x1: edge.x1,
			y1: edge.y1,
			cx: edge.cx,
			cy: edge.cy,
			x2: edge.x2,
			y2: edge.y2
		}
	}
	
	function _buildShape(id, edges, fill, stroke){
		var x1 = 0;
		var y1 = 0;
		var x2 = 0;
		var y2 = 0;
		var commands = [];
		for(var i = 0; edges[i]; i++){
			var edge = edges[i];
			x1 = edge.x1;
			y1 = edge.y1;
			if(x1 != x2 || y1 != y2){ commands.push('M', x1, y1); }
			x2 = edge.x2;
			y2 = edge.y2;
			if(edge.cx == null || edge.cy == null){
				if(x2 == x1){ commands.push('V', y2); }
				else if(y2 == y1){ commands.push('H', x2); }
				else{ commands.push('L', x2,  y2); }
			}else{ commands.push('Q', edge.cx, edge.cy, x2, y2); }
		}
		return {
			type: "shape",
			id: id,
			commands: commands,
			fill: fill,
			stroke: stroke
		};
	}
	
	function _calcPointKey(x, y){
		return (x + 50000) * 100000 + y;
	}
	
	function _getUrl(url, target){
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
	}
})();
