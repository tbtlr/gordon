/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var _g = Gordon;
	var _properties = {
		multR: 1.0,
		multG: 1.0,
		multB: 1.0,
		multA: 1.0,
		addR: 0.0,
		addG: 0.0,
		addB: 0.0,
		addA: 0.0
	};
	
	_g.Cxform = function(cxform){
		for(var p in _properties){ this[p] = isNaN(cxform[p]) ? _properties[p] : cxform[p]; }
	};
	_g.Cxform.prototype = {
		toArray: function(){
			with(this){
				return [multR, 0, 0, 0, addR, 0, multG, 0, 0, addG, 0, 0, multB, 0, addB, 0, 0, 0, multA, addA];
			}
		},
		
		toString: function(){
			return this.toArray().join(' ');
		}
	};
})();
