/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var _g = Gordon;
	var _properties = {
		scaleX: 1.0,
		scaleY: 1.0,
		skewX: 0.0,
		skewY: 0.0,
		moveX: 0,
		moveY: 0
	};
	
	_g.Matrix = function(matrix){
		for(var p in _properties){ this[p] = isNaN(matrix[p]) ? _properties[p] : matrix[p]; }
	};
	_g.Matrix.prototype = {
		toArray: function(){
			with(this){
				return [scaleX, skewX, skewY, scaleY, moveX, moveY];
			}
		},
		
		toString: function(){
			with(this){
				return "matrix(" + this.toArray().join(' ') + ')';
			}
		}
	};
})();
