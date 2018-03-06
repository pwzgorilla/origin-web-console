'use strict';

angular.module('openshiftConsole')
  .controller('ServiceInstanceController', function ($scope,
                                                     $filter,
                                                     $routeParams,
                                                     APIService,
                                                     BindingService,
                                                     DataService,
                                                     ProjectsService,
                                                     ServiceInstancesService) {
    $scope.alerts = {};
    $scope.projectName = $routeParams.project;
    $scope.serviceInstance = null;
    $scope.serviceClass = null;

    $scope.breadcrumbs = [
      {
        title: "Provisioned Services",
        link: "project/" + $routeParams.project + "/browse/service-instances"
      }
    ];

    $scope.deprovision = function() {
      if ($scope.serviceInstance.metadata.deletionTimestamp) {
        return;
      }
      ServiceInstancesService.deprovision($scope.serviceInstance, $scope.bindings);
    };

    var watches = [];

    var serviceInstanceDisplayName = $filter('serviceInstanceDisplayName');

    // API Versions
    var serviceBindingsVersion = APIService.getPreferredVersion('servicebindings');
    $scope.serviceInstancesVersion = APIService.getPreferredVersion('serviceinstances');

    var updateBreadcrumbs = function() {
      $scope.breadcrumbs.push({
        title: $scope.displayName
      });
    };

    var updateServiceClass = function() {
      if ($scope.serviceClass) {
        return;
      }

      ServiceInstancesService.fetchServiceClassForInstance($scope.serviceInstance).then(function(serviceClass) {
        $scope.serviceClass = serviceClass;
        $scope.displayName = serviceInstanceDisplayName($scope.serviceInstance, serviceClass);
        updateBreadcrumbs();
      });
    };

    var updatePlan = function() {
      if (ServiceInstancesService.isCurrentPlan($scope.serviceInstance, $scope.plan)) {
        return;
      }

      ServiceInstancesService.fetchServicePlanForInstance($scope.serviceInstance).then(function(plan) {
        $scope.plan = plan;
      });
    };

    var serviceResolved = function(serviceInstance, action) {
      $scope.loaded = true;
      $scope.serviceInstance = serviceInstance;

      if (action === "DELETED") {
        $scope.alerts["deleted"] = {
          type: "warning",
          message: "This provisioned service has been deleted."
        };
      }

      updateServiceClass();
      updatePlan();
    };

    ProjectsService
      .get($routeParams.project)
      .then(_.spread(function(project, context) {
        $scope.project = project;
        $scope.projectContext = context;

        DataService
          .get($scope.serviceInstancesVersion, $routeParams.instance, context, { errorNotification: false })
          .then(function(serviceInstance) {
            serviceResolved(serviceInstance);
            watches.push(DataService.watchObject($scope.serviceInstancesVersion, $routeParams.instance, context, serviceResolved));

            watches.push(DataService.watch(serviceBindingsVersion, context, function(bindingsData) {
              var allBindings = bindingsData.by('metadata.name');
              $scope.bindings = BindingService.getBindingsForResource(allBindings, serviceInstance);
            }));
          }, function(error) {
            $scope.loaded = true;
            $scope.alerts["load"] = {
              type: "error",
              message: "The provisioned service details could not be loaded.",
              details: $filter('getErrorDetails')(error)
            };
          });

        $scope.$on('$destroy', function(){
          DataService.unwatchAll(watches);
        });
    }));
  });
