/*
	Create a fake worker thread of IE and other browsers
	Remember: Only pass in primitives, and there is none of the native
			security happening
*/

if(!self.Worker)
{
	Worker = function ( scriptFile )
	{
		var self = this ;
		var __timer = null ;
		var __text = null ;
		var __fileContent = null ;
		var onmessage ;
	
		self.onerror = null ;
		self.onmessage = null ;

		// child has run itself and called for it's parent to be notified
		var postMessage = function( text )
		{
			if ( "function" == typeof self.onmessage )
			{
				return self.onmessage( { "data" : text } ) ;
			}
			return false ;
		} ;

		// Method that starts the threading
		self.postMessage = function( text )
		{
			__text = text ;
			__iterate() ;
			return true ;
		} ;

		var __iterate = function()
		{
			// Execute on a timer so we dont block (well as good as we can get in a single thread)
			__timer = setTimeout(__onIterate,1);
			return true ;
		} ;

		var __onIterate = function()
		{
			try
			{
				if ( "function" == typeof onmessage )
				{
					onmessage({ "data" : __text });
				}
				return true ;
			}
			catch( ex )
			{
				if ( "function" == typeof self.onerror )
				{
					return self.onerror( ex ) ;
				}
			}
			return false ;
		} ;


		self.terminate = function ()
		{
			clearTimeout( __timer ) ;
			return true ;
		} ;
		
		
		var importScripts = self.importScripts = function(src)
		{
			// hack time, this will import the script but not wait for it to load...
			var script = document.createElement("SCRIPT") ;
			script.src = src ;
			script.setAttribute( "type", "text/javascript" ) ;
			document.getElementsByTagName("HEAD")[0].appendChild(script)
			return true ;
		} ;
		
		
		/* HTTP Request*/
		var getHTTPObject = function () 
		{
			var xmlhttp;
			try 
			{
				xmlhttp = new XMLHttpRequest();
			}
			catch (e) 
			{
				try 
				{
					xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
				}
				catch (e) 
				{
					xmlhttp = false;
				}
			}
			return xmlhttp;
		}

		var http = getHTTPObject()
		http.open("GET", scriptFile, false)
		http.send(null);

		if (http.readyState == 4) 
		{
			var strResponse = http.responseText;
			//var strResponse = http.responseXML;
			switch (http.status) 
			{
				case 404: // Page-not-found error
					alert('Error: Not Found. The requested function could not be found.');
					break;
				case 500: // Display results in a full window for server-side errors
					alert(strResponse);
					break;
				default:
					__fileContent = strResponse ;
					// IE functions will become delagates of the instance of Worker
					eval( __fileContent ) ;
					/*
					at this point we now have:
					a delagate "onmessage(event)"
					*/
					break;
			}
		}

		return true ;
	} ;
}