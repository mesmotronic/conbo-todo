/**
 * Conbo.js localStorage Adapter
 * Version 1.0.0
 */
(function (root, factory) 
{
	if (typeof exports === 'object' && typeof require === 'function') 
	{
		module.exports = factory(require('underscore'), require('conbo'));
	} 
	else if (typeof define === 'function' && define.amd)
	{
		// AMD. Register as an anonymous module.
		define(['underscore','conbo'], function(_, conbo) 
		{
			// Use global variables if the locals are undefined.
			return factory(_ || root._, conbo || root.conbo);
		});
	}
	else
	{
		// RequireJS isn't being used. Assume underscore and conbo are loaded in <script> tags
		factory(_, conbo);
	}
}
(this, function(_, conbo)
{
	// A simple module to replace `conbo.sync` with *localStorage*-based
	// persistence. Models are given GUIDS, and saved into a JSON object. Simple
	// as that.
	
	// Hold reference to Underscore.js and conbo.js in the closure in order
	// to make things work even if they are removed from the global namespace
	
	// Generate four random hex digits.
	function S4() 
	{
		 return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
	};
	
	// Generate a pseudo-GUID by concatenating random hexadecimal.
	function guid() 
	{
		 return (S4()+S4()+'-'+S4()+'-'+S4()+'-'+S4()+'-'+S4()+S4()+S4());
	};
	
	// Our Store is represented by a single JS object in *localStorage*. Create it
	// with a meaningful name, like the name you'd give a table.
	conbo.LocalStorage = conbo.Class.extend
	({
		initialize: function(name) 
		{
			if(!this.localStorage) 
			{
				throw new Error('localStorage not supported');
			}
			
			var store = this.localStorage().getItem(name);
			
			this.name = name;
			this.records = (store && store.split(',')) || [];
		},
	
		// Save the current state of the **Store** to *localStorage*.
		save: function() 
		{
			this.localStorage().setItem(this.name, this.records.join(','));
		},
		
		// Add a model, giving it a (hopefully)-unique GUID, if it doesn't already
		// have an id of it's own.
		create: function(model) 
		{
			if (!model.id) 
			{
				model.id = guid();
				model.set(model.idAttribute, model.id);
			}
			
			this.localStorage().setItem(this.name+'-'+model.id, JSON.stringify(model));
			this.records.push(model.id.toString());
			this.save();
			
			return this.find(model);
		},
	
		// Update a model by replacing its copy in `this.data`.
		update: function(model) 
		{
			this.localStorage().setItem(this.name+'-'+model.id, JSON.stringify(model));
			
			if (!_.include(this.records, model.id.toString()))
			{
				this.records.push(model.id.toString()); 
				this.save();
			}
			
			return this.find(model);
		},
	
		// Retrieve a model from `this.data` by id.
		find: function(model) 
		{
			return this.jsonData(this.localStorage().getItem(this.name+'-'+model.id));
		},
		
		// Return the array of all models currently in storage.
		findAll: function() 
		{
			// Lodash removed _#chain in v1.0.0-rc.1
			return (_.chain || _)(this.records)
				.map(function(id) { return this.jsonData(this.localStorage().getItem(this.name+'-'+id)); }, this)
				.compact()
				.value();
		},
	
		// Delete a model from `this.data`, returning it.
		destroy: function(model) 
		{
			if (model.isNew())
			{
				return false;
			}
			
			this.localStorage().removeItem(this.name+'-'+model.id);
			
			this.records = _.reject(this.records, function(id)
			{
				return id === model.id.toString();
			});
			
			this.save();
			
			return model;
		},
	
		localStorage: function() 
		{
			return localStorage;
		},
		
		// fix for 'illegal access' error on Android when JSON.parse is passed null
		jsonData: function(data) 
		{
			return data && JSON.parse(data);
		},
		
		toString: function()
		{
			return 'conbo.LocalStorage';
		},
		
		// Clear localStorage for specific collection.
		_clear: function() 
		{
			var local = this.localStorage(),
				itemRe = new RegExp('^' + this.name + '-');
	
			// Remove id-tracking item (e.g., 'foo').
			local.removeItem(this.name);
	
			// Lodash removed _#chain in v1.0.0-rc.1
			// Match all data items (e.g., 'foo-ID') and remove.
			(_.chain || _)(local).keys()
				.filter(function (k) { return itemRe.test(k); })
				.each(function (k) { local.removeItem(k); });
			
			this.records.length = 0;
		},
	
		// Size of localStorage.
		_storageSize: function() {
			return this.localStorage().length;
		}
	
	},
	
	// Static properties
	{
		// localSync delegate to the model or collection's
		// *localStorage* property, which should be an instance of `Store`.
		sync: function(method, model, options) 
		{
			var store = model.localStorage || model.collection.localStorage;
			var resp, errorMessage, syncDfd = conbo.$.Deferred && conbo.$.Deferred(); //If $ is having Deferred - use it.
			
			try 
			{
				switch (method) 
				{
					case 'read':
						resp = model.id == undefined ? store.findAll() : store.find(model);
						break;
					case 'create':
						resp = store.create(model);
						break;
					case 'update':
						resp = store.update(model);
						break;
					case 'delete':
						resp = store.destroy(model);
						break;
				}
			}
			catch (error) 
			{
				if (error.code === 22 && store._storageSize() === 0)
				{
					errorMessage = 'Private browsing is unsupported';
				}
				else
				{
					errorMessage = error.message;
				}
			}
			
			if (resp) 
			{
				if (options && options.success) 
				{
					options.success(resp);
				}
				
				if (syncDfd) 
				{
					syncDfd.resolve(resp);
				}
		
			}
			else 
			{
				errorMessage = !!errorMessage 
					? errorMessage
					: 'Record Not Found';
		
				if (options && options.error)
				{
					options.error(errorMessage);
				}
				
				if (syncDfd)
				{
					syncDfd.reject(errorMessage);
				}
			}
			
			// add compatibility with $.ajax
			// always execute callback for success and error
			if (options && options.complete) options.complete(resp);
		
			return syncDfd && syncDfd.promise();
		}
	});
	
	conbo.ajaxSync = conbo.sync;
	
	conbo.getSyncMethod = function(model) 
	{
		if(model.localStorage || (model.collection && model.collection.localStorage)) 
		{
			return conbo.LocalStorage.sync;
		}
	
		return conbo.ajaxSync;
	};
	
	// Override 'conbo.sync' to default to localSync,
	// the original 'conbo.sync' is still available in 'conbo.ajaxSync'
	conbo.sync = function(method, model, options) 
	{
		return conbo.getSyncMethod(model).apply(this, [method, model, options]);
	};
	
	return conbo.LocalStorage;
	
}));