/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var _g = Gordon;
	var _properties = {
		r: 255,
		g: 255,
		b: 255,
		a: 1
	};
	
	_g.Color = function(color){
		if(typeof color == "string"){
			var match = color.match(/^#([0-9,a-z]{2})([0-9,a-z]{2})([0-9,a-z]{2})/i);
			if(match){ color = {
				r: parseInt(match[1], 16),
				g: parseInt(match[2], 16),
				b: parseInt(match[3], 16)
			}; }
		}
		for(var p in _properties){ this[p] = isNaN(color[p]) ? _properties[p] : color[p]; }
	};
	_g.Color.prototype = {
		toArray: function(withAlpha){
			var t = this;
			var array = [t.r, t.g, t.b];
			if(withAlpha){ array.push(t.a); }
			return array;
		},
		
		toString: function(withAlpha){
			return "rgb" + (withAlpha ? 'a' : '') + '(' + this.toArray(withAlpha).join(", ") + ')';
		}
	};
})();
