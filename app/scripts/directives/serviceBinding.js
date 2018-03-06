'use strict';

(function() {
  angular.module('openshiftConsole').component('serviceBinding', {
    controller: [
      ServiceBinding
    ],
    controllerAs: '$ctrl',
    bindings: {
      namespace: '<',
      binding: '<',
      refApiObject: '<?',
      serviceClasses: '<',
      serviceInstances: '<'
    },
    templateUrl: 'views/directives/_service-binding.html'
  });

  function ServiceBinding() {
    var ctrl = this;
    var updateServiceClass = function() {
      var instanceName = _.get(ctrl.binding, 'spec.instanceRef.name');
      var instance = _.get(ctrl.serviceInstances, [instanceName]);
      var serviceClassName = _.get(instance, 'spec.serviceClassName');
      ctrl.serviceClass = _.get(ctrl.serviceClasses, [serviceClassName]);
    };

    this.$onChanges = function(changes) {
      if (changes.binding || changes.serviceInstances || changes.serviceClasses) {
        updateServiceClass();
      }
    };
  }
})();
