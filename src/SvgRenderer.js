/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var NS_SVG = "http://www.w3.org/2000/svg";
	var NS_XLINK = "http://www.w3.org/1999/xlink";
	
	var _g = Gordon;
	var _d = document;
	var _buttonMask = 0;
	
	_g.SvgRenderer = function(width, height, viewWidth, viewHeight, quality, scale, bgcolor){
		var t = this;
		t.width = width;
		t.height = height;
		t.viewWidth = viewWidth;
		t.viewHeight = viewHeight;
		t.quality = null;
		t.scale = scale || _g.scaleValues.DEFAULT;
		t.bgcolor = null;
		t._dictionary = {};
		t._displayList = {};
		t._eventTarget = null;
		var n = t._node = t._createElement("svg");
		var attributes = {
			width: width,
			height: height
		};
		if(viewWidth && viewHeight && (width != viewWidth || height != viewHeight)){
			var viewBox = [0, 0, viewWidth, viewHeight];
			attributes.viewBox = viewBox.toString();
			if(scale == _g.scaleValues.EXACT_FIT){ attributes.preserveAspectRatio = "none"; }
		}
		t._setAttributes(n, attributes);
		t._defs = n.appendChild(t._createElement("defs"));
		t._screen = n.appendChild(t._createElement('g'));
		t._currentDefId = 0;
		t._setQuality(quality || _g.qualityValues.HIGH);
		if(bgcolor){ t.setBgcolor(bgcolor); }
	};
	_g.SvgRenderer.prototype = {
		_createElement: function(name){
			return _d.createElementNS(NS_SVG, name);
		},
		
		_setAttributes: function(node, attributes, namespace){
			for(var name in attributes){
				var value = attributes[name];
				name = name == "className" ? "class" : name.replace(/_/g, '-');
				if(namespace){ node.setAttributeNS(namespace, name, value); }
				else{ node.setAttribute(name, value); }
			}
			return node;
		},
		
		_setQuality: function(quality){
			var q = _g.qualityValues;
			var t = this;
			switch(quality){
				case q.LOW:
					var attributes = {
						shape_rendering: "crispEdges",
						image_rendering: "optimizeSpeed",
						text_rendering: "optimizeSpeed",
						color_rendering: "optimizeSpeed"
					}
					break;
				case q.AUTO_LOW:
				case q.AUTO_HIGH:
					var attributes = {
						shape_rendering: "auto",
						image_rendering: "auto",
						text_rendering: "auto",
						color_rendering: "auto"
					}
					break;
				case q.MEDIUM:
					var attributes = {
						shape_rendering: "optimizeSpeed",
						image_rendering: "optimizeSpeed",
						text_rendering: "optimizeLegibility",
						color_rendering: "optimizeSpeed"
					}
					break;
				case q.HIGH:
					var attributes = {
						shape_rendering: "geometricPrecision",
						image_rendering: "auto",
						text_rendering: "geometricPrecision",
						color_rendering: "optimizeQuality"
					}
					break;
				case q.BEST:
					var attributes = {
						shape_rendering: "geometricPrecision",
						image_rendering: "optimizeQuality",
						text_rendering: "geometricPrecision",
						color_rendering: "optimizeQuality"
					}
					break;
			}
			t._setAttributes(t._screen, attributes);
			t.quality = quality;
			return t;
		},
		
		getNode: function(){
			return this._node;
		},
		
		setBgcolor: function(rgb){
			var t = this;
			if(!t.bgcolor){
				t._node.style.background = _color2string(rgb);
				t.bgcolor = rgb;
			}
			return t;
		},
		
		defineObject: function(object){
			var type = object.type;
			var t = this;
			var node = null;
			var id = object.id;
			var attributes = {id: type + id};
			switch(type){
				case "shape":
					var segments = object.segments;
					if(segments){
						var node = t._createElement('g');
						segments.forEach(function(segment){
							node.appendChild(t._buildShape(segment));
						});
					}else{ var node = t._buildShape(object); }
					break;
				case "image":
					var node = t._createElement("image");
					t._setAttributes(node, {href: object.uri}, NS_XLINK);
					attributes.width = object.width;
					attributes.height = object.height;
					break;
				case "button":
					var node = t._createElement('g');
					var activeArea = t._createElement('g');
					var states = object.states;
					var b = _g.buttonStates;
					for(var s in states){
						var display = s == b.HIT ? activeArea : node.appendChild(t._createElement('g'));
						t._setAttributes(display, {
							className: "state" + s,
							opacity: s == b.UP ? 1 : 0
						});
						var filter = object.filter;
						var list = states[s];
						for(var depth in list){
							if(filter){
								var character = _cloneCharacter(list[depth]);
								character.filter = filter;
							}else{ var character = list[depth]; }
							display.appendChild(t._buildCharacter(character));
						}
					}
					node.appendChild(activeArea);
					break;
				case "font":
					var info = object.info;
					if(info){
						var node = t._createElement("font");
						var faceNode = node.appendChild(t._createElement("font-face"));
						t._setAttributes(faceNode, {font_family: info.name});
						var glyphs = object.glyphs;
						var codes = info.codes;
						glyphs.forEach(function(glyph, i){
							var glyphNode = node.appendChild(t._createElement("glyph"));
							t._setAttributes(glyphNode, {
								unicode: String.fromCharCode(codes[i]),
								d: glyph.commands.join(' ')
							});
						});
					}
					break;
				case "text":
					var node = t._createElement('g');
					var strings = object.strings;
					strings.forEach(function(string){
						var textNode = node.appendChild(t._createElement("text"));
						var entries = string.entries;
						var advances = [];
						var font = t._dictionary[string.font].object;
						var info = font.info;
						var codes = info.codes
						var characters = [];
						var x = string.x;
						entries.forEach(function(entry){
							advances.push(x);
							characters.push(String.fromCharCode(codes[entry.index]));
							x += entry.advance;
						});
						t._setAttributes(textNode, {
							font_family: info.name,
							font_size: string.size,
							fill: _color2string(string.fill),
							x: advances.join(' '),
							y: string.y
						});
						textNode.appendChild(_d.createTextNode(characters.join('')));
					});
					attributes.transform = _matrix2string(object.matrix);
					break;
				case "filter":
					var node = t._createElement("filter");
					var cxform = object.cxform;
					if(cxform){
						var feNode = node.appendChild(t._createElement("feColorMatrix"));
						t._setAttributes(feNode, {
							type: "matrix",
							values: _cxform2string(cxform)
						});
					}
					break;
			}
			if(node){
				t._setAttributes(node, attributes);
				t._defs.appendChild(node);
				t._dictionary[id] = {
					object: object,
					node: node
				}
			}
			return t;
		},
		
		_buildShape: function(shape){
			var t = this;
			var node = t._createElement("path");
			var fill = shape.fill;
			var stroke = shape.stroke;
			var attributes = {d: shape.commands.join(' ')};
			if(fill){
				if(fill.type){
					t._defineFill(fill);
					attributes.fill = "url(#" + fill.type + t._currentDefId + ')';
				}else{ attributes.fill = _color2string(fill); }
				attributes.fill_rule = "evenodd";
			}else{ attributes.fill = "none"; }
			if(stroke){
				attributes.stroke = _color2string(stroke.color);
				attributes.stroke_width = Math.max(stroke.width, 1);
				attributes.stroke_linecap = attributes.stroke_linejoin = "round";
			}
			t._setAttributes(node, attributes);
			return node;
		},
		
		_defineFill: function(fill){
			var type = fill.type;
			var t = this;
			var attributes = {id: type + (++t._currentDefId)};
			switch(type){
				case "linear":
				case "radial":
					var node = t._createElement(type + "Gradient");
					attributes.gradientUnits = "userSpaceOnUse";
					attributes.gradientTransform = _matrix2string(fill.matrix);
					if("linear" == type){ 
						attributes.x1 = -819.2;
						attributes.x2 = 819.2;
					}else{
						attributes.cx = attributes.cy = 0;
						attributes.r = 819.2;
					}
					var s = _g.spreadModes;
					switch(fill.spread){
						case s.REFLECT:
							attributes.spreadMethod = "reflect";
							break;
						case s.REPEAT:
							attributes.spreadMethod = "repeat";
							break;
					}
					var i = _g.interpolationModes;
					if(fill.interpolation == i.LINEAR_RGB){ attributes.color_interpolation = "linearRGB"; }
					var stops = fill.stops;
					stops.forEach(function(stop){
						var stopNode = node.appendChild(t._createElement("stop"));
						t._setAttributes(stopNode, {
							offset: stop.offset,
							stop_color: _color2string(stop.color)
						});
					});
					break;
				case "pattern":
					var node = t._createElement("pattern");
					var useNode = node.appendChild(t._createElement("use"));
					var img = fill.image;
					t._setAttributes(useNode, {href: "#image" + img.id}, NS_XLINK);
					attributes.patternUnits = "userSpaceOnUse";
					attributes.patternTransform = _matrix2string(fill.matrix);
					attributes.width = img.width;
					attributes.height = img.height;
					break;
			}
			t._setAttributes(node, attributes);
			t._defs.appendChild(node);
			return t;
		},
		
		placeCharacter: function(character){
			var depth = character.depth;
			var t = this;
			var d = t._displayList;
			var replace = d[depth];
			if(!replace || replace.character !== character){
				var node = t._buildCharacter(character);
				var s = t._screen;
				if(replace && replace !== character){ t.removeCharacter(depth); }
				if(1 == depth){ s.insertBefore(node, s.firstChild); }
				else{
					var nextDepth = 0;
					for(var entry in d){
						if(entry > depth){
							nextDepth = entry;
							break;
						}
					}
					if(nextDepth){ s.insertBefore(node, d[nextDepth].node); }
					else{ s.appendChild(node); }
				}
				d[depth] = {
					character: character,
					node: node
				};
			}
			return t;
		},
		
		_buildCharacter: function(character){
			var t = this;
			var d = t._dictionary;
			var object = d[character.object].object;
			var type = object.type;
			switch(type){
				case "button":
					var node = d[character.object].node.cloneNode(true);
					var b = _g.buttonStates;
					var displayMap = {};
					for(var i in b){
						var state = b[i];
						displayMap[state] = node.getElementsByClassName("state" + state)[0];
					}
					var m = _g.mouseButtons;
					var isMouseOver = false;
					var mouseupHandle = function(event){
						if(!(_buttonMask & m.LEFT)){
							if(isMouseOver){
								setState(b.OVER);
								object.action();
							}else{ setState(b.UP); }
							_d.removeEventListener("mouseup", mouseupHandle, false);
							t.eventTarget = null;
						}
						return false;
					};
					with(displayMap[b.HIT]){
						onmouseover = function(event){
							isMouseOver = true;
							if(!t.eventTarget){
								if(_buttonMask & m.LEFT){ this.onmousedown(event); }
								else{ setState(b.OVER); }
							}
							return false;
						};
						onmouseout = function(event){
							isMouseOver = false;
							if(!t.eventTarget){ setState(this == t.eventTarget ? b.OVER : b.UP); }
							return false;
						};
						onmousedown = function(event){
							if(_buttonMask & m.LEFT){
								setState(b.DOWN);
								_d.addEventListener("mouseup", mouseupHandle, false);
								t.eventTarget = this;
							}
							return false;
						};
						onmouseup = function(event){
							setState(b.OVER);
							return false;
						};
					}
					var currentState = b.UP;
					var setState = function(state){
						t._setAttributes(displayMap[currentState], {opacity: 0});
						t._setAttributes(displayMap[state], {opacity: 1});
						currentState = state;
					};
					break;
				default:
					var node = t._createElement("use");
					t._setAttributes(node, {href: "#" + type + object.id}, NS_XLINK);
			}
			var filter = character.filter;
			if(filter){ attributes.filter = "url(#filter" + filter.id + ')'; }
			t._setAttributes(node, {
				id: "character" + character.id * -1,
				className: "depth" + character.depth,
				transform: _matrix2string(character.matrix)
			});
			return node;
		},
		
		removeCharacter: function(depth){
			var d = this._displayList;
			var s = this._screen;
			s.removeChild(d[depth].node);
			delete d[depth];
			return this;
		},
		
		toggleQuality: function(){
			var t = this;
			var q = _g.qualityValues;
			switch(t.quality){
				case q.LOW:
					t._setQuality(q.HIGH);
					break;
				case q.AUTO_LOW:
					t._setQuality(q.AUTO_HIGH);
					break;
				case q.AUTO_HIGH:
					t._setQuality(q.AUTO_LOW);
					break;
				case q.HIGH:
					t._setQuality(q.LOW);
					break;
			}
			return t;
		}
	};
	
	function _color2string(color){
		if("string" == typeof color){ return color.match(/^([0-9a-z]{1,2}){3}$/i) ? color : null; }
		with(color){
			return "rgb(" + [r, g, b] + ')';
		}
	}
	
	function _matrix2string(matrix){
		with(matrix){
			return "matrix(" + [scaleX, skewX, skewY, scaleY, moveX, moveY] + ')';
		}
	}
	
	function _cxform2string(cxform){
		with(cxform){
			return [multR, 0, 0, 0, addR, 0, multG, 0, 0, addG, 0, 0, multB, 0, addB, 0, 0, 0, multA, addA].toString();
		}
	}
	
	function _cloneCharacter(character){
		with(character){
			return {
				object: object,
				depth: depth,
				matrix: matrix,
				cxform: character.cxform
			};
		}
	}
	
	_d.addEventListener("mousedown", function(event){
		_buttonMask |= 0x01 << event.button;
	}, true);
	_d.addEventListener("mouseup", function(event){
		_buttonMask ^= 0x01 << event.button;
	}, true);
})();
