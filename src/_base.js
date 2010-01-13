/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

(function(){
	var _g = Gordon;
	
	_g.qualityValues = {
		LOW: "low",
		AUTO_LOW: "autolow",
		AUTO_HIGH: "autohigh",
		MEDIUM: "medium",
		HIGH: "high",
		BEST: "best"
	};
	_g.scaleValues = {
		DEFAULT: "default",
		NO_ORDER: "noorder",
		EXACT_FIT: "exactfit"
	};
	_g.signatures = {
		SWF: "FWS",
		COMPRESSED_SWF: "CWS" 
	}
	_g.movieStates = {
		LOADING: 0,
		LOADED: 1,
		PLAYING: 2,
		STOPPED: 3
	},
	_g.tagCodes = {
		END: 0,
		SHOW_FRAME: 1,
		DEFINE_SHAPE: 2,
		PLACE_OBJECT: 4,
		REMOVE_OBJECT: 5,
		DEFINE_BITS: 6,
		DEFINE_BUTTON: 7,
		JPEG_TABLES: 8,
		SET_BACKGROUND_COLOR: 9,
		DEFINE_FONT: 10,
		DEFINE_TEXT: 11,
		DO_ACTION: 12,
		DEFINE_FONT_INFO: 13,
		DEFINE_SOUND: 14,
		START_SOUND: 15,
		DEFINE_BUTTON_SOUND: 17,
		SOUND_STREAM_HEAD: 18,
		SOUND_STREAM_BLOCK: 19,
		DEFINE_BITS_LOSSLESS: 20,
		DEFINE_BITS_JPEG2: 21,
		DEFINE_SHAPE2: 22,
		DEFINE_BUTTON_CXFORM: 23,
		PROTECT: 24,
		PLACE_OBJECT2: 26,
		REMOVE_OBJECT2: 28,
		DEFINE_SHAPE3: 32,
		DEFINE_TEXT2: 33,
		DEFINE_BUTTON2: 34,
		DEFINE_BITS_JPEG3: 35,
		DEFINE_BITS_LOSSLESS2: 36,
		DEFINE_EDIT_TEXT: 37,
		DEFINE_SPRITE: 39,
		FRAME_LABEL: 43,
		SOUND_STREAM_HEAD2: 45,
		DEFINE_MORPH_SHAPE: 46,
		DEFINE_FONT2: 48,
		EXPORT_ASSETS: 56,
		IMPORT_ASSETS: 57,
		ENABLE_DEBUGGER: 58,
		DO_INIT_ACTION: 59,
		DEFINE_VIDEO_STREAM: 60,
		VIDEO_FRAME: 61,
		DEFINE_FONT_INFO2: 62,
		ENABLE_DEBUGGER2: 64,
		SCRIPT_LIMITS: 65,
		SET_TAB_INDEX: 66,
		FILE_ATTRIBUTES: 69,
		PLACE_OBJECT3: 70,
		IMPORT_ASSETS2: 71,
		DEFINE_FONT_ALIGN_ZONES: 73,
		CSM_TEXT_SETTINGS: 74,
		DEFINE_FONT3: 75,
		SYMBOL_CLASS: 76,
		METADATA: 77,
		DEFINE_SCALING_GRID: 78,
		DO_ABC: 82,
		DEFINE_SHAPE4: 83,
		DEFINE_MORPH_SHAPE2: 84,
		DEFINE_SCENE_AND_FRAME_LABEL_DATA: 86,
		DEFINE_BINARY_DATA: 87,
		DEFINE_FONT_NAME: 88,
		START_SOUND2: 89,
		DEFINE_BITS_JPEG4: 90,
		DEFINE_FONT4: 91
	};
	_g.tagNames = {};
	_g.tagHandlerMap = {};
	for(var name in _g.tagCodes){
		var code = _g.tagCodes[name];
		_g.tagNames[code] = name;
		_g.tagHandlerMap[code] = "_handle" + name.toLowerCase().replace(/(^|_)([a-z])/g, function(match, p1, p2){
			return p2.toUpperCase();
		});
	}
	_g.fillStyleTypes = {
		SOLID: 0x00, 
		LINEAR_GRADIENT: 0x10, 
		RADIAL_GRADIENT: 0x12,
		FOCAL_RADIAL_GRADIENT: 0x13,
		REPEATING_BITMAP: 0x40, 
		CLIPPED_BITMAP: 0x41, 
		NON_SMOOTHED_REPEATING_BITMAP: 0x42,
		NON_SMOOTHED_CLIPPED_BITMAP: 0x43
	};
	_g.spreadModes = {
		PAD: 0,
		REFLECT: 1,
		REPEAT: 2
	};
	_g.interpolationModes = {
		RGB: 0,
		LINEAR_RGB: 1
	};
	_g.styleChangeStates = {
		MOVE_TO: 0x01,
		LEFT_FILL_STYLE: 0x02,
		RIGHT_FILL_STYLE: 0x04,
		LINE_STYLE: 0x08,
		NEW_STYLES: 0x10
	};
	_g.buttonStates = {
		UP: 0x01,
		OVER: 0x02,
		DOWN: 0x04,
		HIT: 0x08
	};
	_g.textStyleFlags = {
		HAS_FONT: 0x08,
		HAS_COLOR: 0x04,
		HAS_XOFFSET: 0x01,
		HAS_YOFFSET: 0x02
	};
	_g.actionCodes = {
		PLAY: 0x06,
		STOP: 0x07,
		NEXT_FRAME: 0x04,
		PREVIOUS_FRAME: 0x05,
		GOTO_FRAME: 0x81,
		GOTO_LABEL: 0x08c,
		WAIT_FOR_FRAME: 0x8a,
		GET_URL: 0x83,
		STOP_SOUNDS: 0x09,
		TOGGLE_QUALITY: 0x08,
		SET_TARGET: 0x08b
	};
	_g.urlTargets = {
		SELF: "_self",
		BLANK: "_blank",
		PARENT: "_parent",
		TOP: "_top"
	};
	_g.PX_IN_TWIPS = 20;
	
	_g.twips2px = function(twips){
		return twips / _g.PX_IN_TWIPS;
	};
})();
