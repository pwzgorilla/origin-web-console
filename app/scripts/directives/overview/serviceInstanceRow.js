'use strict';

(function() {
  angular.module('openshiftConsole').component('serviceInstanceRow', {
    controller: [
      '$filter',
      'APIService',
      'AuthorizationService',
      'BindingService',
      'ListRowUtils',
      'ServiceInstancesService',
      ServiceInstanceRow
    ],
    controllerAs: 'row',
    bindings: {
      apiObject: '<',
      state: '<',
      bindings: '<'
    },
    templateUrl: 'views/overview/_service-instance-row.html'
  });

  function ServiceInstanceRow($filter,
                              APIService,
                              AuthorizationService,
                              BindingService,
                              ListRowUtils,
                              ServiceInstancesService) {
    var row = this;
    var isBindingFailed = $filter('isBindingFailed');
    var isBindingReady = $filter('isBindingReady');
    var serviceInstanceFailedMessage = $filter('serviceInstanceFailedMessage');
    var truncate = $filter('truncate');

    _.extend(row, ListRowUtils.ui);

    var serviceInstanceDisplayName = $filter('serviceInstanceDisplayName');

    row.serviceBindingsVersion = APIService.getPreferredVersion('servicebindings');
    row.serviceInstancesVersion = APIService.getPreferredVersion('serviceinstances');

    var getServiceClass = function() {
      var serviceClassName = ServiceInstancesService.getServiceClassNameForInstance(row.apiObject);
      return _.get(row, ['state','serviceClasses', serviceClassName]);
    };

    var getServicePlan = function() {
      var servicePlanName = ServiceInstancesService.getServicePlanNameForInstance(row.apiObject);
      return _.get(row, ['state', 'servicePlans', servicePlanName]);
    };

    var updateInstanceStatus = function() {
      if (_.get(row.apiObject, 'metadata.deletionTimestamp')) {
        row.instanceStatus = 'deleted';
      } else if (isBindingFailed(row.apiObject)) {
        row.instanceStatus = 'failed';
      } else if (isBindingReady(row.apiObject)) {
        row.instanceStatus = 'ready';
      } else {
        row.instanceStatus = 'pending';
      }
    };

    var updateInstanceStatus = function() {
      var conditions = _.get(row.apiObject, 'status.conditions');
      var readyCondition = _.find(conditions, {type: 'Ready'});

      row.instanceError = _.find(conditions, {type: 'Failed', status: 'True'});

      if (_.get(row.apiObject, 'metadata.deletionTimestamp')) {
        row.instanceStatus = 'deleted';
      } else if (row.instanceError) {
        row.instanceStatus = 'failed';
      } else if (readyCondition && readyCondition.status === 'True') {
        row.instanceStatus = 'ready';
      } else {
        row.instanceStatus = 'pending';
        row.pendingMessage = _.get(readyCondition, 'message') || 'The instance is being provisioned asynchronously.';
      }
    };

    row.$doCheck = function() {
      updateInstanceStatus();

      row.notifications = ListRowUtils.getNotifications(row.apiObject, row.state);
      row.displayName = serviceInstanceDisplayName(row.apiObject, row.state.serviceClasses);
      row.isBindable = !row.instanceError &&
                       BindingService.isServiceBindable(row.apiObject, row.state.serviceClasses);
      row.description = getDescription();
    };

    row.$onChanges = function(changes) {
      if (changes.bindings) {
        row.deleteableBindings = _.reject(row.bindings, 'metadata.deletionTimestamp');
      }
    };

    row.getSecretForBinding = function(binding) {
      return binding && _.get(row, ['state', 'secrets', binding.spec.secretName]);
    };

    row.actionsDropdownVisible = function() {
      // no actions on those marked for deletion
      if (_.get(row.apiObject, 'metadata.deletionTimestamp')) {
        return false;
      }

      // We can create bindings
      if (row.isBindable && AuthorizationService.canI({resource: 'serviceinstancecredentials', group: 'servicecatalog.k8s.io'}, 'create')) {
        return true;
      }
      // We can delete bindings
      if (!_.isEmpty(row.deleteableBindings) && AuthorizationService.canI({resource: 'serviceinstancecredentials', group: 'servicecatalog.k8s.io'}, 'delete')) {
        return true;
      }
      // We can delete instances
      if (AuthorizationService.canI({resource: 'serviceinstances', group: 'servicecatalog.k8s.io'}, 'delete')) {
        return true;
      }

      return false;
    };

    row.closeOverlayPanel = function() {
      _.set(row, 'overlay.panelVisible', false);
    };

    row.showOverlayPanel = function(panelName, state) {
      _.set(row, 'overlay.panelVisible', true);
      _.set(row, 'overlay.panelName', panelName);
      _.set(row, 'overlay.state', state);
    };

    row.getFailedTooltipText = function() {
      var message = serviceInstanceFailedMessage(row.apiObject);
      if (!message) {
        return '';
      }

      var truncated = truncate(message, 128);
      if (message.length !== truncated.length) {
        truncated += '...';
      }

      return truncated;
    };

    row.deprovision = function() {
      var modalScope = {
        alerts: {
          deprovision: {
            type: 'error',
            message: 'Service \'' + row.apiObject.spec.serviceClassName + '\' will be deleted and no longer available.'
          }
        },
        detailsMarkup: 'Delete Service?',
        okButtonText: 'Delete',
        okButtonClass: 'btn-danger',
        cancelButtonText: 'Cancel'
      };
      // TODO: we probably have to handle bindings in here.
      // either:
      // - automatically remove the bindings
      // - tell the user they must manually unbind before continue
      $uibModal.open({
        animation: true,
        templateUrl: 'views/modals/confirm.html',
        controller: 'ConfirmModalController',
        resolve: {
          modalConfig: function() {
            return modalScope;
          }
        }
      })
      .result.then(function() {
        NotificationsService.hideNotification("deprovision-service-error");
        DataService.delete({
          group: 'servicecatalog.k8s.io',
          resource: 'serviceinstances'
        },
        row.apiObject.metadata.name,
        { namespace: row.apiObject.metadata.namespace },
        { propagationPolicy: null }) // TODO - remove once this is resolved https://github.com/kubernetes-incubator/service-catalog/issues/942
        .then(function() {
          NotificationsService.addNotification({
            type: "success",
            message: "Successfully deleted " + row.apiObject.metadata.name + "."
          });
        }, function(err) {
          NotificationsService.addNotification({
            id: "deprovision-service-error",
            type: "error",
            message: "An error occurred while deleting " + row.apiObject.metadata.name + ".",
            details: getErrorDetails(err)
          });
        });
      });
    };
  }
})();
