(function() {
  var viewModel, DEBUG = false;

  // ##########################
  // Support functions
  // ##########################

  var log = function(msg) {
    if (DEBUG) {
      var d = new Date();
      console.log('[' + d + ' + ' + d.getMilliseconds() + ' ms] ' + msg + '...');
    }
  }

  // Clears the city (autocomplete) input text and the view model's city data (ID and name).
  var clearCity = function() {
    $('#city').val('');

    updateViewModelCity(null, null);
  }

  // Clears the school (autocomplete) input text and the view model's school data (ID and name).
  var clearSchool = function() {
    $('#school').val('');

    updateViewModelSchool(null, null);
  }

  var updateViewModelCity = function(id, name) {
    viewModel.cityId(id);
    viewModel.cityName(name);
  }

  var updateViewModelSchool = function(id, name) {
    viewModel.schoolId(id);
    viewModel.schoolName(name);
  }

  var jsonCache = {};
  var cachedGetJSON = function(url, params, callback) {
    var cacheKey = url + ', ' + JSON.stringify(params);
    
    if (cacheKey in jsonCache) {
      log('getting JSON from cache');
      callback(jsonCache[cacheKey]);
    } else {
      $.getJSON(url, params, function(data) {
        log('saving JSON in cache');
        jsonCache[cacheKey] = data;
        callback(data);
      });
    }
  }

  // ##########################
  // View Model definition
  // ##########################

  var ViewModel = function() {
    self = this;
  
    self.enemSubject = ko.observable();
    self.year        = ko.observable();
    self.cityId      = ko.observable();
    self.cityName    = ko.observable();
    self.schoolId    = ko.observable();
    self.schoolName  = ko.observable();
    self.state       = ko.observable();

    // When changing state, clear and move focus to city.
    self.state.subscribe(function(value) { 
      clearCity();
      setTimeout(function() { $('#city').focus(); }, 200);
    });

    // When changing city, clear and move focus to school.
    self.cityId.subscribe(function(value) { 
      clearSchool();
      setTimeout(function() { $('#school').focus(); }, 200);
    });

    // ##########################
    // Chart series data for school
    // ##########################
    
    self.schoolSeriesData          = ko.observable();
    self.schoolSeriesDataRefresher = ko.computed(function() {
      log('schoolSeriesData being refreshed');
      
      // Reset the current series data.
      self.schoolSeriesData(null); 

      // Return if no school selected.
      if (!self.schoolId()) { log('returning'); return; }
      
      cachedGetJSON(
        '/schools/' + self.schoolId() + '/aggregated_scores/' + self.year() + '/' + self.enemSubject() + '.json', 
        {}, 
        self.schoolSeriesData
      );
    });

    // ##########################
    // Chart series data for city
    // ##########################

    self.citySeriesData          = ko.observable();
    self.citySeriesDataRefresher = ko.computed(function() {
      log('citySeriesData being refreshed');

      // Reset the current series data.
      self.citySeriesData(null); 

      // Return if no city selected.
      if (!self.cityId()) { log('returning'); return; }

      cachedGetJSON(
        '/cities/' + self.cityId() + '/aggregated_scores/' + self.year() + '/' + self.enemSubject() + '.json', 
        {}, 
        self.citySeriesData
      );
    });

    // ##########################
    // Chart data source
    // ##########################

    self.dataSource          = ko.observable();
    self.dataSourceRefresher = ko.computed(function() {
      log('dataSource being calculated');
      
      // Reset the current data source.
      self.dataSource(null);

      // Return if either school or city series data is not available.
      if (!self.schoolSeriesData() || !self.citySeriesData()) { log('returning'); return; }

      // Calculate totals.
      var schoolTotal = 0.0, cityTotal = 0.0;
      $.each(self.schoolSeriesData(), function(index, value) { schoolTotal  += value })
      $.each(self.citySeriesData(),   function(index, value) { cityTotal    += value })

      // Format the data source.
      var dataSource = [];
      for (var i = 0; i < 10; i++) {
        dataSource[i] = {
          scoreRange: i + '-' + (i + 1), 
          school: schoolTotal > 0 ? (self.schoolSeriesData()[i + 1] / schoolTotal || 0) * 100.0 : 0.0,
          city:   cityTotal   > 0 ? (self.citySeriesData()  [i + 1] / cityTotal   || 0) * 100.0 : 0.0
        }
      }

      self.dataSource(dataSource);
    }).extend({ throttle: 100 });   // Use the "throttle" extender so changes to self.enemSubject() or self.year() don't 
                                    // cause this computed observable to be called twice (given it depends on these 2 
                                    // observables plus self.schoolSeriesData() and self.citySeriesData(), which in 
                                    // turn also depend on them).

    // ##########################
    // Chart series
    // ##########################

    self.series = ko.computed(function() {
      return [
        { valueField: 'school', name: self.schoolName() },
        { valueField: 'city',   name: 'Média da cidade de ' + self.cityName() }
      ];
    });

    // ##########################
    // Chart options
    // ##########################

    self.chartOptions = {
      dataSource: ko.computed(self.dataSource),
      series:     ko.computed(self.series),
      commonSeriesSettings: {
        argumentField: 'scoreRange',
        type: 'bar',
        label:{
          visible: true,
          format: "fixedPoint",
          precision: 1
        }
      },
      title: { text: 'Histograma de comparação' },    
      legend: {
        verticalAlignment: 'bottom',
        horizontalAlignment: 'center'
      }      
    };
  };

  $(function() {
    // Initialize Knockout.
    viewModel = new ViewModel();
    ko.applyBindings(viewModel);

    // ##########################
    // Autocompletes
    // ##########################

    var autocompleteCache = { cities: {}, schools: {} };
  
    $('#city').autocomplete({
      minLength: 3,
      source: function(request, response) {
        var term  = request.term;
        var state = viewModel.state();

        cachedGetJSON('/states/' + state + '/cities/search.json', { term: term }, function(data) { response(data.cities); });
      },
      select: function(event, ui) {
        // Update the view model's city (ID and name).
        updateViewModelCity(ui.item.id, ui.item.value);
      }
    });

    $('#school').autocomplete({
      minLength: 3,
      source: function(request, response) {
        var term   = request.term;
        var cityId = viewModel.cityId();

        cachedGetJSON('/cities/' + cityId + '/schools/search.json', { term: term }, function(data) { response(data.schools); });
      },
      select: function(event, ui) {
        // Update the view model's school (id and name).
        updateViewModelSchool(ui.item.id, ui.item.value);
      }
    });
  });
})();
