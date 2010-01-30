/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

importScripts("../gordon.js");

(function(){
	var _g = Gordon;
	var _t2p = _g.twips2px;
	
	onmessage = function(e){
		Parser.parse(e.data);
	};
	
	(function(){
		var _s = _currentFrame = null;
		var _dictionary = {};
		var _currentCharacterId = 0;
		var _jpegTables = null;
		
		Parser = {
			parse: function(data){
				_s = new _g.Stream(data);
				var h = _g.tagHandlers;
				var f = _g.tagCodes.SHOW_FRAME;
				do{
					_currentFrame = {
						type: "frame",
						displayList: {}
					};
					do{
						var header = _s.readUI16();
					  	var code = header >> 6;
					  	var length = header & 0x3f;
					    if(length >= 0x3f){ length = _s.readUI32(); }
						var handler = h[code];
						if(this[handler]){ this[handler](_s.tell(), length); }
						else{ _s.seek(length); }
					}while(code && code != f);
				}while(code);
				return this;
			},
			
			handleShowFrame: function(){
				_register(_currentFrame);
				return this;
			},
			
			handleDefineShape: function(){
				var id = _s.readUI16();
				var bounds = _s.readRect();
				var t = this;
				var fillStyles = t._readFillStyleArray();
				var lineStyles = t._readLineStyleArray();
				var numFillBits = _s.readUB(4);
				var numLineBits = _s.readUB(4);
				var segment = [];
				var isFirst = true;
				var edges = [];
				var leftFill = rightFill = fsOffset = lsOffset = 0;
				var leftFillEdges = {};
				var rightFillEdges = {};
				var i = line = 0;
				var lineEdges = {};
				var c = _g.styleChangeStates;
				var x1 = y1 = x2 = y2 = 0;
				var countFillChanges = countLineChanges = 0;
				var useSinglePath = true;
				do{
					var type = _s.readUB(1);
					var flags = null;
					if(type){
						var isStraight = _s.readBool();
						var numBits = _s.readUB(4) + 2;
						x1 = x2, y1 = y2;
						var cx = cy = null;
						if(isStraight){
							var isGeneral = _s.readBool();
							if(isGeneral){
								x2 += _t2p(_s.readSB(numBits));
								y2 += _t2p(_s.readSB(numBits));
							}else{
								var isVertical = _s.readBool();
				  	  			if(isVertical){ y2 += _t2p(_s.readSB(numBits)); }
				  	  			else{ x2 += _t2p(_s.readSB(numBits)); }
				  	  		}
						}else{
							cx = x1 + _t2p(_s.readSB(numBits));
							cy = y1 + _t2p(_s.readSB(numBits));
							x2 = cx + _t2p(_s.readSB(numBits));
							y2 = cy + _t2p(_s.readSB(numBits));
						}
						x2 = Math.round(x2 * 100) / 100;
						y2 = Math.round(y2 * 100) / 100;
						segment.push({i: i++, f: isFirst, x1: x1, y1: y1, cx: cx, cy: cy, x2: x2, y2: y2});
						isFirst = false;
					}else{
						if(segment.length){
							Array.prototype.push.apply(edges, segment);
							if(leftFill){
								var index = fsOffset + leftFill;
								var list = leftFillEdges[index];
								if(!list){ list = leftFillEdges[index] = []; }
								segment.forEach(function(edge){
									var e = _cloneEdge(edge);
									e.i = i++;
									var tx1 = e.x1;
									var ty1 = e.y1;
									e.x1 = e.x2;
									e.y1 = e.y2;
									e.x2 = tx1;
									e.y2 = ty1;
									list.push(e);
								});
							}
							if(rightFill){
								var index = fsOffset + rightFill;
								var list = rightFillEdges[index];
								if(!list){ list = rightFillEdges[index] = []; }
								Array.prototype.push.apply(list, segment);
							}
							if(line){
								var index = lsOffset + line;
								var list = lineEdges[index];
								if(!list){ list = lineEdges[index] = []; }
								Array.prototype.push.apply(list, segment);
							}
							segment = [];
							isFirst = true;
						}
						var flags = _s.readUB(5);
						if(flags){
							if(flags & c.MOVE_TO){
								var numBits = _s.readUB(5);
						  		x2 = _t2p(_s.readSB(numBits));
								y2 = _t2p(_s.readSB(numBits));
					  	  	}
					  	  	if(flags & c.LEFT_FILL_STYLE){
								leftFill = _s.readUB(numFillBits);
								countFillChanges++;
							}
					  	  	if(flags & c.RIGHT_FILL_STYLE){
								rightFill = _s.readUB(numFillBits);
								countFillChanges++;
							}
							if(flags & c.LINE_STYLE){
								line = _s.readUB(numLineBits);
								countLineChanges++;
							}
							if((leftFill && rightFill) || (countFillChanges + countLineChanges) > 2){
								useSinglePath = false;
							}
					  	  	if(flags & c.NEW_STYLES){
						 		Array.prototype.push.apply(fillStyles, t._readFillStyleArray());
								Array.prototype.push.apply(lineStyles, t._readLineStyleArray());
								numFillBits = _s.readUB(4);
								numLineBits = _s.readUB(4);
								fsOffset = fillStyles.length;
								lsOffset = lineStyles.length;
								useSinglePath = false;
							}
						}
					}
				}while(type || flags);
				_s.align();
				var shape = null;
				if(useSinglePath){
					var fill = leftFill || rightFill;
					var fillStyle = fill ? fillStyles[fsOffset + fill - 1] : null;
					var lineStyle = lineStyles[lsOffset + line - 1];
					shape = _buildShape(edges, fillStyle, lineStyle);
					shape.id = id;
					shape.bounds = bounds;
				}else{
					var fillShapes = [];
					var i = fillStyles.length;
					while(i--){
						var fill = i + 1;
						fillEdges = [];
						var list = leftFillEdges[fill];
						if(list){ Array.prototype.push.apply(fillEdges, list); }
						list = rightFillEdges[fill];
						if(list){ Array.prototype.push.apply(fillEdges, list); }
						var edgeMap = {};
						fillEdges.forEach(function(edge){
							var key = _calcPointKey(edge.x1, edge.y1);
							var list = edgeMap[key];
							if(!list){ list = edgeMap[key] = []; }
							list.push(edge);
						});
						var pathEdges = [];
						var countFillEdges = fillEdges.length;
						for(var j = 0; j < countFillEdges && !pathEdges[countFillEdges - 1]; j++){
							var edge = fillEdges[j];
							if(!edge.c){
								var segment = [];
								var firstKey = _calcPointKey(edge.x1, edge.y1);
								var isUsed = {};
								do{
									segment.push(edge);
									isUsed[edge.i] = true;
									var key = _calcPointKey(edge.x2, edge.y2);
									if(key == firstKey){
										var k = segment.length;
										while(k--){ segment[k].c = true; }
										Array.prototype.push.apply(pathEdges, segment);
										break;
									}
									var list = edgeMap[key];
									if (!(list && list.length)){ break; }
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
									edge = nextEdge;
								}while(edge);
							}
						}
						if(pathEdges.length){
							shape = _buildShape(pathEdges, fillStyles[i]);
							shape.index = pathEdges.pop().i;
							fillShapes.push(shape);
						}
					}
					var strokeShapes = [];
					var i = lineStyles.length;
					while(i--){
						var pathEdges = lineEdges[i + 1];
						if(pathEdges){
							shape = _buildShape(pathEdges, null, lineStyles[i]);
							shape.index = pathEdges.pop().i;
							strokeShapes.push(shape);
						}
					}
					var segments = fillShapes.concat(strokeShapes);
					segments.sort(function(a, b){
						return a.index - b.index;
					});
					if(segments.length > 1){
						shape = {
							type: "shape",
							id: id,
							bounds: bounds,
							segments: segments
						}
					}else{
						delete shape.index;
						shape.id = id;
						shape.bounds = bounds;
					}
				}
				_register(shape);
				return t;
			},
			
			_readFillStyleArray: function(){
				var numStyles = _s.readUI8();
				if(0xff == numStyles){ numStyles = _s.readUI16(); }
				var styles = [];
				var i = numStyles;
				while(i--){
					var type = _s.readUI8();
					var f = _g.fillStyleTypes;
					switch(type){
						case f.SOLID:
							styles.push(_s.readRgb());
							break;
						case f.LINEAR_GRADIENT:
						case f.RADIAL_GRADIENT:
							var style = {
								type: type == f.LINEAR_GRADIENT ? "linear" : "radial",
								matrix: _s.readMatrix(),
								spread: _s.readUB(2),
								interpolation: _s.readUB(2),
								stops: []
							};
							var numStops = _s.readUB(4);
							var stops = style.stops;
							var j = numStops;
							while(j--){ stops.push({
								offset: _s.readUI8() / 255,
								color: _s.readRgb()
							}); }
							styles.push(style);
							break;
						case f.REPEATING_BITMAP:
						case f.CLIPPED_BITMAP:
							var imgId = _s.readUI16();
							var img = _dictionary[imgId];
							var matrix = _s.readMatrix();
							if(img){
								with(matrix){
									scaleX = _t2p(scaleX);
									scaleY = _t2p(scaleY);
									skewX = _t2p(skewX);
									skewY = _t2p(skewY);
								}
								styles.push({
									type: "pattern",
									image: img,
									matrix: matrix
								});
							}else{ styles.push(null); }
							break;
					}
				}
				return styles;
			},
			
			_readLineStyleArray: function(){
				var numStyles = _s.readUI8();
				if(0xff == numStyles){ numStyles = _s.readUI16(); }
				var styles = [];
				var i = numStyles;
				while(i--){ styles.push({
					width: _t2p(_s.readUI16()),
					color: _s.readRgb()
				}); }
				return styles;
			},
			
			handlePlaceObject: function(offset, length){
				var id = _s.readUI16();
				var depth = _s.readUI16();
				var character = {
					id: --_currentCharacterId,
					object: id,
					depth: depth,
					matrix: _s.readMatrix()
				};
				if(_s.tell() - offset != length){
					_register({
						type: "filter",
						id: _currentCharacterId,
						cxform: _s.readCxform()
					});
					character.filter = _currentCharacterId;
				}
				_currentFrame.displayList[depth] = character;
				return this;
			},
			
			handleRemoveObject: function(){
				var id = _s.readUI16();
				var depth = _s.readUI16();
				_currentFrame.displayList[depth] = null;
				return this;
			},
			
			handleDefineBits: function(offset, length, withTables){
				var id = _s.readUI16();
				var jpg = this._readJpeg(length - 2);
				if(withTables){ var data = _encodeBase64(jpg.data); }
				else{
					var header = _jpegTables.substr(0, _jpegTables.length - 2);
					var data = _encodeBase64(header + jpg.data.substr(2));
				}
				_register({
					type: "image",
					id: id,
					uri: "data:image/jpeg;base64," + data,
					width: jpg.width,
					height: jpg.height
				});
				return this;
			},
			
			_readJpeg: function(length){
				var data = _s.readString(length);
				var s = new _g.Stream(data);
				var width = height = 0;
				for(var i = 0; data[i]; i += 2){
					var header = s.readUI16(true);
					var length = s.readUI16(true);
					if(header == 0xffc0){
						s.seek(1);
						var height = s.readUI16(true);
						var width = s.readUI16(true);
						break;
					}
				}
				return {
					data: data,
					width: width,
					height: height
				};
			},
			
			handleDefineButton: function(){
				var id = _s.readUI16();
				var states = {};
				do{
					var flags = _s.readUI8();
					if(flags){
						var object = _s.readUI16();
						var depth = _s.readUI16();
						var character = {
							id: --_currentCharacterId,
							object: object,
							depth: depth,
							matrix: _s.readMatrix()
						}
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
				_register({
					type: "button",
					id: id,
					states: states,
					action: this._readAction()
				});
				return this;
			},
			
			_readAction: function(){
				var stack = [];
				do{
					var code = _s.readUI8();
					var length = code > 0x80 ? _s.readUI16() : 0;
					var a = _g.actionCodes;
					switch(code){
						case a.PLAY:
							stack.push("t.play()");
							break;
						case a.STOP:
							stack.push("t.stop()");
							break;
						case a.NEXT_FRAME:
							stack.push("t.nextFrame()");
							break;
						case a.PREVIOUS_FRAME:
							stack.push("t.prevFrame()");
							break;
						case a.GOTO_FRAME:
							var frame = _s.readUI16();
							stack.push("t.goto(" + frame + ')');
							break;
						case a.GET_URL:
							var url = _s.readString();
							var target = _s.readString();
							stack.push("t.getUrl('" + url + "', '" + target + "')");
							break;
						case a.TOGGLE_QUALITY:
							stack.push("t.toggleQuality()");
							break;
						default:
							_s.seek(length);
					}
				}while(code);
				return "function(t){" + stack.join(';') + "}";
			},
			
			handleJpegTables: function(offset, length){
				_jpegTables = _s.readString(length);
				return this;
			},
			
			handleSetBackgroundColor: function(){
				_currentFrame.bgcolor = _s.readRgb();
				return this;
			},
			
			handleDefineFont: function(){
				var id = _s.readUI16();
				var numGlyphs = _s.readUI16() / 2;
				_s.seek(numGlyphs * 2 - 2);
				var c = _g.styleChangeStates;
				var glyphs = [];
				var i = numGlyphs;
				while(i--){
					var numFillBits = _s.readUB(4);
					var numLineBits = _s.readUB(4);
					var x = y = 0;
					var commands = [];
					do{
						var type = _s.readUB(1);
						var flags = null;
						if(type){
							var isStraight = _s.readBool();
							var numBits = _s.readUB(4) + 2;
							if(isStraight){
								var isGeneral = _s.readBool();
								if(isGeneral){
									x += _s.readSB(numBits);
									y += _s.readSB(numBits);
									commands.push('L', x, -y);
								}else{
									var isVertical = _s.readBool();
					  	  			if(isVertical){
										y += _s.readSB(numBits);
										commands.push('V', -y);
									}else{
										x += _s.readSB(numBits);
										commands.push('H', x);
									}
					  	  		}
							}else{
								var cx = x + _s.readSB(numBits);
								var cy = y + _s.readSB(numBits);
								x = cx + _s.readSB(numBits);
								y = cy + _s.readSB(numBits);
								commands.push('Q', cx, -cy, x, -y);
							}
						}else{
							var flags = _s.readUB(5);
							if(flags){
								if(flags & c.MOVE_TO){
									var numBits = _s.readUB(5);
					    	  		x = _s.readSB(numBits);
									y = _s.readSB(numBits);
									commands.push('M', x, -y);
						  	  	}
							  	if(flags & c.LEFT_FILL_STYLE || flags & c.RIGHT_FILL_STYLE){ _s.readUB(numFillBits); }
							}
						}
					}while(type || flags);
					_s.align();
					glyphs.push({commands: commands});
				}
				_register({
					type: "font",
					id: id,
					glyphs: glyphs
				});
				return this;
			},
			
			handleDefineText: function(){
				var id = _s.readUI16();
				var text = {
					type: "text",
					id: id,
					bounds: _s.readRect(),
					matrix: _s.readMatrix(),
					strings: []
				};
				var numGlyphBits = _s.readUI8();
				var numAdvBits = _s.readUI8();
				var font = fill = null;
				var x = y = size = 0;
				var string = null;
				var strings = text.strings;
				do{
					var header = _s.readUB(8);
					if(header){
						var type = header >> 7;
						if(type){
							var flags = header & 0x0f;
							if(flags){
								var string = {};
								var f = _g.textStyleFlags;
								if(flags & f.HAS_FONT){ font = _s.readUI16(); }
								if(flags & f.HAS_COLOR){ fill = _s.readRgb(); }
								if(flags & f.HAS_XOFFSET){ x = _t2p(_s.readSI16()); }
								if(flags & f.HAS_YOFFSET){ y = _t2p(_s.readSI16()); }
								if(flags & f.HAS_FONT){ size = _t2p(_s.readUI16()); }
							}
							string = {
								font: font,
								fill: fill,
								x: x,
								y: y,
								size: size
							};
							strings.push(string);
						}else{
							var numGlyphs = header & 0x7f;
							var entries = string.entries = [];
							var i = numGlyphs;
							while(i--){
								var entry = {};
								entry.index = _s.readUB(numGlyphBits);
								entry.advance = _t2p(_s.readSB(numAdvBits));
								entries.push(entry);
							}
							_s.align();
						}
					}
				}while(header);
				_register(text);
				return this;
			},
			
			handleDoAction: function(){
				_currentFrame.action = this._readAction();
				return this;
			},
			
			handleDefineFontInfo: function(){
				var fontId = _s.readUI16();
				var font = _dictionary[fontId];
				var f = font.info = {
					name: _s.readString(_s.readUI8()),
					isSmall: _s.readBool(3),
					isShiftJis: _s.readBool(),
					isAnsi: _s.readBool(),
					isItalic: _s.readBool(),
					isBold: _s.readBool(),
					codes: []
				};
				var useWideCodes = _s.readBool();
				var codes = f.codes;
				var i = font.glyphs.length;
				while(i--){
					var code = useWideCodes ? _s.readUI16() : _s.readUI8();
					codes.push(code);
				}
				_register(font);
				return this;
			},
			
			handleDefineBitsJpeg2: function(offset, length){
				return this.handleDefineBits(offset, length, true);
			},
			
			handleDefineShape2: function(){
				return this.handleDefineShape.apply(this, arguments);
			},
			
			handleDefineButtonCxform: function(){
				var buttonId = _s.readUI16();
				var button = _dictionary[buttonId];
				_register({
					id: button.id,
					type: "filter",
					cxform: _s.readCxform()
				});
				button.filter = _currentCharacterId;
				_register(button);
				return this;
			},
			
			handleProtect: function(offset, length){
				_s.seek(length);
				return this;
			}
		};
		
		var _useJson = _g.USE_NATIVE_JSON;

		var _register = function(object){
			postMessage(_useJson ? JSON.stringify(object) : object);
			_dictionary[object.id] = object;
		}
		
		function _cloneEdge(edge){
			with(edge){
				return {i: i, f: f, x1: x1, y1: y1, cx: cx, cy: cy, x2: x2, y2: y2};
			}
		}
		
		function _buildShape(edges, fill, stroke){
			var x1 = y1 = x2 = y2 = 0;
			var commands = [];
			edges.forEach(function(edge){
				x1 = edge.x1;
				y1 = edge.y1;
				if(x1 != x2 || y1 != y2){ commands.push('M', x1, y1); }
				x2 = edge.x2;
				y2 = edge.y2;
				if(null == edge.cx || null == edge.cy){
					if(x2 == x1){ commands.push('V', y2); }
					else if(y2 == y1){ commands.push('H', x2); }
					else{ commands.push('L', x2,  y2); }
				}else{ commands.push('Q', edge.cx, edge.cy, x2, y2); }
			});
			return {
				type: "shape",
				commands: commands,
				fill: fill,
				stroke: stroke
			};
		}
		
		function _calcPointKey(x, y){
			return (x + 50000) * 100000 + y;
		}
		
		var B64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		
		function _encodeBase64(data){
			var byteNum = 0;
		    var byte = prevByte = null;
		    chars = [];
		    for(var i = 0; data[i]; i++){
				byteNum = i % 3;
		        byte = data.charCodeAt(i) & 0xff;
		        switch(byteNum){
		            case 0:
		                chars.push(B64_DIGITS[byte >> 2]);
		                break;
		            case 1:
		                chars.push(B64_DIGITS[((prevByte & 3) << 4) | (byte >> 4)]);
		                break;
		            case 2:
		                chars.push(B64_DIGITS[((prevByte & 0x0f) << 2) | (byte >> 6)], B64_DIGITS[byte & 0x3f]);
		                break;
		        }
		        prevByte = byte;
		    }
		    if(!byteNum){ chars.push(B64_DIGITS[(prevByte & 3) << 4], "=="); }
			else if (byteNum == 1){ chars.push(B64_DIGITS[(prevByte & 0x0f) << 2], '='); }
		    return chars.join('');
		}
	})();
})();
