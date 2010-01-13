/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var NAMESPACE_SVG = "http://www.w3.org/2000/svg";
	var NAMESPACE_XLINK = "http://www.w3.org/1999/xlink";
	
	var _g = Gordon;
	var _buttonMask = 0;
	
	document.addEventListener("mousedown", function(event){
		_buttonMask |= 0x01 << event.button;
	}, true);
	document.addEventListener("mouseup", function(event){
		_buttonMask ^= 0x01 << event.button;
	}, true);
	
	_g.SvgRenderer = function(width, height, viewWidth, viewHeight, quality, scale, bgcolor){
		var t = this;
		t.width = width;
		t.height = height;
		t.viewWidth = viewWidth;
		t.viewHeight = viewHeight;
		t.quality = null;
		t.scale = _g.scaleValues.DEFAULT;
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
			attributes.viewBox = viewBox.join(' ');
			if(scale == _g.scaleValues.EXACT_FIT){ attributes.preserveAspectRatio = "none"; }
		}
		t._setAttributes(n, attributes);
		t._defs = n.appendChild(t._createElement("defs"));
		t._screen = n.appendChild(t._createElement('g'));
		t._currentFillId = t._currentFilterId = 0;
		t._setQuality(quality || _g.qualityValues.HIGH);
		if(bgcolor){ t.setBgcolor(bgcolor); }
	};
	_g.SvgRenderer.prototype = {
		_createElement: function(name){
			return document.createElementNS(NAMESPACE_SVG, name);
		},
		
		_setAttributes: function(node, attributes, namespace){
			for(var name in attributes){
				var value = attributes[name];
				name = name.replace(/_/, '-');
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
						color_rendering: "optimizeSpeed",
						shape_rendering: "crispEdges",
						text_rendering: "optimizeSpeed",
						image_rendering: "optimizeSpeed"
					}
					break;
				case q.AUTO_LOW:
				case q.AUTO_HIGH:
					var attributes = {
						color_rendering: "auto",
						shape_rendering: "auto",
						text_rendering: "auto",
						image_rendering: "auto"
					}
					break;
				case q.MEDIUM:
					var attributes = {
						color_rendering: "optimizeSpeed",
						shape_rendering: "optimizeSpeed",
						text_rendering: "optimizeLegibility",
						image_rendering: "optimizeSpeed"
					}
					break;
				case q.HIGH:
					var attributes = {
						color_rendering: "optimizeQuality",
						shape_rendering: "geometricPrecision",
						text_rendering: "geometricPrecision",
						image_rendering: "auto"
					}
					break;
				case q.BEST:
					var attributes = {
						color_rendering: "optimizeQuality",
						shape_rendering: "geometricPrecision",
						text_rendering: "geometricPrecision",
						image_rendering: "optimizeQuality"
					}
					break;
			}
			t._setAttributes(this._screen, attributes);
			t.quality = quality;
			return t;
		},
		
		getNode: function(){
			return this._node;
		},
		
		setBgcolor: function(rgb){
			var t = this;
			if(!t.bgcolor){
				var color = new Gordon.Color(rgb);
				t._node.style.background = color.toString();
				t.bgcolor = color;
			}
			return t;
		},
		
		defineCharacter: function(character){
			var object = character.object;
			var id = object.id;
			var t = this;
			var d = t._dictionary;
			if(!d[id]){
				var type = object.type;
				switch(type){
					case "shape":
						var segments = object.segments;
						if(segments){
							var node = t._createElement('g');
							for(var i = 0; segments[i]; i++){
								var segment = segments[i];
								node.appendChild(t._buildShape(segments[i]));
							}
						}else{ var node = t._buildShape(object); }
						t._setAttributes(t._defs.appendChild(node), {id: "shape" + id});
						break;
					case "button":
						var states = object.states;
						for(var state in states){
							var list = states[state];
							for(var depth in list){ t.defineCharacter(list[depth]); }
						}
						break;
					case "text":
						t._setAttributes(t._defs.appendChild(t._buildText(object)), {id: "text" + id});
						break;
				}
				d[id] = object;
			}
			var cxform = character.cxform;
			if(cxform){
				with(t._defs.appendChild(t._createElement("filter"))){
					t._setAttributes(appendChild(t._createElement("feColorMatrix")), {
						type: "matrix",
						values: cxform.toString(),
						id: "cxform" + (++t._currentFilterId)
					});
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
					attributes.fill = "url(#" + fill.type + t._currentFillId + ')';
				}else{ attributes.fill = fill.toString(); }
				attributes.fill_rule = "evenodd";
			}else{ attributes.fill = "none"; }
			if(stroke){
				attributes.stroke = stroke.color.toString();
				attributes.stroke_width = Math.max(stroke.width, 1);
				attributes.stroke_linecap = "round";
				attributes.stroke_linejoin = "round";
			}
			t._setAttributes(node, attributes);
			return node;
		},
		
		_defineFill: function(fill){
			var t = this;
			var type = fill.type;
			var attributes = {id: type + (++t._currentFillId)};
			switch(type){
				case "linear":
				case "radial":
					var node = t._createElement(type + "Gradient");
					attributes.gradientUnits = "userSpaceOnUse";
					attributes.gradientTransform = fill.matrix.toString();
					if(type == "linear"){ 
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
					for(var i = 0; stops[i]; i++){
						var stop = stops[i];
						t._setAttributes(node.appendChild(t._createElement("stop")), {
							offset: stop.offset,
							stop_color: stop.color.toString()
						});
					}
					break;
				case "pattern":
					var node = t._createElement("pattern");
					var img = fill.image;
					var imgNode = node.appendChild(t._createElement("image"));
					var attributes = {
						width: img.width,
						height: img.height
					};
					t._setAttributes(imgNode, {href: img.data}, NAMESPACE_XLINK);
					t._setAttributes(imgNode, attributes);
					attributes.patternUnits = "userSpaceOnUse";
					attributes.patternTransform = fill.matrix.toString();
					
			}
			t._setAttributes(t._defs.appendChild(node), attributes);
			return t;
		},
		
		_buildText: function(text){
			var t = this;
			var node = t._createElement('g');
			t._setAttributes(node, {transform: text.matrix.toString()});
			var strings = text.strings;
			for(var i = 0; strings[i]; i++){
				var string = strings[i];
				var font = string.font;
				t._defineFont(font);
				var entries = string.entries;
				var advances = [];
				var info = font.info;
				var codes = info.codes
				var characters = [];
				var x = string.x;
				for(var j = 0; entries[j]; j++){
					var entry = entries[j];
					advances.push(x);
					characters.push(String.fromCharCode(codes[entry.index]));
					x += entry.advance;
				}
				var textNode = node.appendChild(t._createElement("text"));
				t._setAttributes(textNode, {
					font_family: info.name,
					font_size: string.size,
					fill: string.fill.toString(),
					x: advances.join(' '),
					y: string.y
				});
				textNode.appendChild(document.createTextNode(characters.join('')));
			}
			return node;
		},
		
		_defineFont: function(font){
			var id = font.id;
			var t = this;
			var d = t._dictionary;
			if(!d[id]){
				var node = t._defs.appendChild(t._createElement("font-face"));
				var info = font.info;
				var glyphs = font.glyphs;
				var codes = info.codes;
				t._setAttributes(node, {
					font_family: info.name,
					units_per_em: 1024
				});
				for(var i = 0; glyphs[i]; i++){t._setAttributes(t._createElement("glyph"), {
					unicode: String.fromCharCode(codes[i]),
					d: glyphs[i].commands.join(' ')
				}); }
				d[id] = font;
			}
			return t;
		},
		
		placeCharacter: function(character){
			var t = this;
			var d = t._displayList;
			var s = t._screen;
			var node = t._buildCharacter(character);
			var depth = character.depth;
			if(depth == 1){ s.insertBefore(node, s.firstChild); }
			else{
				var nextDepth = 0;
				for(var entry in d){
					if(entry > depth){
						nextDepth = entry;
						break;
					}
				}
				if(nextDepth){ s.insertBefore(node, d[nextDepth]); }
				else{ s.appendChild(node); }
			}
			d[depth] = node;
			return t;
		},
		
		_buildCharacter: function(character){
			var object = character.object;
			var type = object.type;
			var t = this;
			var id = object.id;
			switch(type){
				case "button":
					var node = t._buildButton(object);
					break;
				default:
					var node = t._createElement("use");
					t._setAttributes(node, {href: "#" + type + id}, NAMESPACE_XLINK);
			}
			var attributes = {transform: character.matrix.toString()};
			if(character.cxform){ attributes.filter = "url(#cxform" + (++t._currentFilterId) + ')'; }
			t._setAttributes(node, attributes);
			return node;
		},
		
		_buildButton: function(button){
			var t = this;
			var node = t._createElement('g');
			var activeArea = t._createElement('g');
			var displayMap = {};
			var b = _g.buttonStates;
			var currentState = b.UP;
			var states = button.states;
			for(var s in states){
				var display = displayMap[s] = s == b.HIT ? activeArea : node.appendChild(t._createElement('g'));
				if(s != currentState){ t._setAttributes(display, {opacity: 0}); }
				var list = states[s];
				for(var depth in list){ display.appendChild(t._buildCharacter(list[depth])); }
			}
			var isMouseOver = false;
			var mouseupHandle = function(event){
				if(!(_buttonMask & 0x01)){
					if(isMouseOver){
						setState(b.OVER);
						button.onClick();
					}else{ setState(b.UP); }
					document.removeEventListener("mouseup", mouseupHandle, false);
					t.eventTarget = null;
				}
				return false;
			};
			with(node.appendChild(activeArea)){
				onmouseover = function(event){
					isMouseOver = true;
					if(!t.eventTarget){
						if(_buttonMask & 0x01){ this.onmousedown(event); }
						else{ setState(b.OVER); }
					}
					return false;
				};
				onmouseout = function(event){
					isMouseOver = false;
					if(!t.eventTarget){ setState(t.eventTarget == this ? b.OVER : b.UP); }
					return false;
				};
				onmousedown = function(event){
					if(_buttonMask & 0x01){
						setState(b.DOWN);
						document.addEventListener("mouseup", mouseupHandle, false);
						t.eventTarget = this;
					}
					return false;
				};
				onmouseup = function(event){
					setState(b.OVER);
					return false;
				};
			}
			var setState = function(state){
				t._setAttributes(displayMap[currentState], {opacity: 0});
				t._setAttributes(displayMap[state], {opacity: 1});
				currentState = state;
			};
			return node;
		},
		
		removeCharacter: function(character){
			var d = this._displayList;
			var depth = character.depth;
			this._screen.removeChild(d[depth]);
			delete d[depth];
			return this;
		},
		
		reset: function(){
			var t = this;
			var d = t._displayList;
			for(var depth in d){ t.removeCharacter({depth: depth}); }
			t._currentFillId = t._currentFilterId = 0;
			return t;
		},
		
		toggleQuality: function(){
			var q = _g.qualityValues;
			var t = this;
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
})();
