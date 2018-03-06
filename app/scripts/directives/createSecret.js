"use strict";

angular.module("openshiftConsole")

  .directive("createSecret",
             function($filter,
                      AuthorizationService,
                      APIService,
                      DataService,
                      NotificationsService,
                      gettext,
                      gettextCatalog) {
                      ApplicationGenerator,
                      DNS1123_SUBDOMAIN_VALIDATION) {

    var serviceAccountsVersion = APIService.getPreferredVersion('serviceaccounts');
    var secretsVersion = APIService.getPreferredVersion('secrets');

    return {
      restrict: 'E',
      scope: {
        type: '=',
        serviceAccountToLink: '=?',
        namespace: '=',
        onCreate: '&',
        onCancel: '&'
      },
      templateUrl: 'views/directives/create-secret.html',
      link: function($scope) {
        $scope.nameValidation = DNS1123_SUBDOMAIN_VALIDATION;

        $scope.secretAuthTypeMap = {
          image: {
            label: gettextCatalog.getString(gettext("Image Secret")),
            authTypes: [
              {
                id: "kubernetes.io/dockercfg",
                label: gettextCatalog.getString(gettext("Image Registry Credentials"))
              },
              {
                id: "kubernetes.io/dockerconfigjson",
                label: gettextCatalog.getString(gettext("Configuration File"))
              }
            ]
          },
          source: {
            label: gettextCatalog.getString(gettext("Source Secret")),
            authTypes: [
              {
                id: "kubernetes.io/basic-auth",
                label: gettextCatalog.getString(gettext("Basic Authentication"))
              },
              {
                id: "kubernetes.io/ssh-auth",
                label: gettextCatalog.getString(gettext("SSH Key"))
              }
            ]
          },
          webhook: {
            label: "Webhook Secret",
            authTypes: [
              {
                id: "Opaque",
                label: "Webhook Secret"
              }
            ]
          }
        };

        $scope.secretTypes = _.keys($scope.secretAuthTypeMap);
        // newSecret format:
        //   - type:                       image || source
        //   - authType:                   image  = [kubernetes.io/dockercfg, "kubernetes.io/dockerconfigjson"]
        //                                 source = ["kubernetes.io/basic-auth, "kubernetes.io/ssh-auth"]
        //   - data:                       based on the authentication type
        //   - pickedServiceAccountToLink  based on the view in which the directive is used.
        //                                  - if in BC the 'builder' SA if picked automatically
        //                                  - if in DC the 'deployer' SA if picked automatically
        //                                  - else the user will have to pick the SA and type of linking
        if ($scope.type) {
          $scope.newSecret = {
            type: $scope.type,
            authType: $scope.secretAuthTypeMap[$scope.type].authTypes[0].id,
            data: {},
            linkSecret: !_.isEmpty($scope.serviceAccountToLink),
            pickedServiceAccountToLink: $scope.serviceAccountToLink || "",
          };
        } else {
          $scope.newSecret = {
            type: "source",
            authType: "kubernetes.io/basic-auth",
            data: {},
            linkSecret: false,
            pickedServiceAccountToLink: "",
          };
        }

        $scope.add = {
          gitconfig: false,
          cacert: false
        };

        // List SA only if $scope.serviceAccountToLink is not defined so user has to pick one.
        if (AuthorizationService.canI('serviceaccounts', 'list') && AuthorizationService.canI('serviceaccounts', 'update')) {
          DataService.list(serviceAccountsVersion, $scope, function(result) {
            $scope.serviceAccounts = result.by('metadata.name');
            $scope.serviceAccountsNames = _.keys($scope.serviceAccounts);
          });
        }

        var constructSecretObject = function(data, authType) {
          var secret = {
            apiVersion: "v1",
            kind: "Secret",
            metadata: {
              name: $scope.newSecret.data.secretName
            },
            type: authType,
            data: {}
          };

          switch (authType) {
            case "kubernetes.io/basic-auth":
              // If the password/token is not entered either .gitconfig or ca.crt has to be provided
              if (data.passwordToken) {
                secret.data = {password: window.btoa(data.passwordToken)};
              } else {
                secret.type = "Opaque";
              }
              if (data.username) {
                secret.data.username = window.btoa(data.username);
              }
              if (data.gitconfig) {
                secret.data[".gitconfig"] = window.btoa(data.gitconfig);
              }
              if (data.cacert) {
                secret.data["ca.crt"] = window.btoa(data.cacert);
              }
              break;
            case "kubernetes.io/ssh-auth":
              secret.data = {'ssh-privatekey': window.btoa(data.privateKey)};
              if (data.gitconfig) {
                secret.data[".gitconfig"] = window.btoa(data.gitconfig);
              }
              break;
            case "kubernetes.io/dockerconfigjson":
              var encodedConfig = window.btoa(data.dockerConfig);
              if (JSON.parse(data.dockerConfig).auths) {
                secret.data[".dockerconfigjson"] = encodedConfig;
              } else {
                secret.type = "kubernetes.io/dockercfg";
                secret.data[".dockercfg"] = encodedConfig;
              }
              break;
            case "kubernetes.io/dockercfg":
              var auth = window.btoa(data.dockerUsername + ":" + data.dockerPassword);
              var configData = {};
              configData[data.dockerServer] = {
                username: data.dockerUsername,
                password: data.dockerPassword,
                email: data.dockerMail,
                auth: auth
              };
              secret.data[".dockercfg"] = window.btoa(JSON.stringify(configData));
              break;
            case "Opaque":
              if (data.webhookSecretKey) {
                _.set(secret, 'stringData.WebHookSecretKey', data.webhookSecretKey);
              }
              break;
          }
          return secret;
        };

        var hideErrorNotifications = function() {
          NotificationsService.hideNotification("create-secret-error");
        };

        var linkSecretToServiceAccount = function(secret) {
          var updatedSA = angular.copy($scope.serviceAccounts[$scope.newSecret.pickedServiceAccountToLink]);
          var rgv = APIService.objectToResourceGroupVersion(updatedSA);
          switch ($scope.newSecret.type) {
          case 'source':
            updatedSA.secrets.push({name: secret.metadata.name});
            break;
          case 'image':
            updatedSA.imagePullSecrets.push({name: secret.metadata.name});
            break;
          }

          DataService.update(rgv, $scope.newSecret.pickedServiceAccountToLink, updatedSA, $scope).then(function(sa) {
            // Show a single success message saying the secret was both created and linked.
            NotificationsService.addNotification({
              type: "success",
              message: "Secret " + secret.metadata.name + " was created and linked with service account " + sa.metadata.name + "."
            });
            $scope.onCreate({newSecret: secret});
          }, function(result){
            // Show a success message that the secret was created and a separate error message saying it couldn't be linked.
            NotificationsService.addNotification({
              type: "success",
              message: "Secret " + secret.metadata.name + " was created."
            });

            // Don't show any error related to linking to SA when linking is done automatically.
            if (!$scope.serviceAccountToLink) {
              NotificationsService.addNotification({
                id: "secret-sa-link-error",
                type: "error",
                message: "An error occurred while linking the secret with service account " + $scope.newSecret.pickedServiceAccountToLink + ".",
                details: $filter('getErrorDetails')(result)
              });
            }
            $scope.onCreate({newSecret: secret});
          });
        };

        var updateEditorMode = _.debounce(function(){
          try {
            JSON.parse($scope.newSecret.data.dockerConfig);
            $scope.invalidConfigFormat = false;
          } catch (e) {
            $scope.invalidConfigFormat = true;
          }
        }, 300, {
          'leading': true
        });

        $scope.aceChanged = updateEditorMode;

        $scope.nameChanged = function() {
          $scope.nameTaken = false;
        };

        $scope.generateWebhookSecretKey = function() {
          $scope.newSecret.data.webhookSecretKey = ApplicationGenerator._generateSecret();
        };

        $scope.create = function() {
          hideErrorNotifications();
          var newSecret = constructSecretObject($scope.newSecret.data, $scope.newSecret.authType);
          DataService.create(secretsVersion, null, newSecret, $scope).then(function(secret) { // Success
            // In order to link:
            // - the SA has to be defined
            // - defined SA has to be present in the obtained SA list
            // - user can update SA
            // Else the linking will be skipped
            if ($scope.newSecret.linkSecret && $scope.serviceAccountsNames.contains($scope.newSecret.pickedServiceAccountToLink) && AuthorizationService.canI('serviceaccounts', 'update')) {
              linkSecretToServiceAccount(secret);
            } else {
              NotificationsService.addNotification({
                type: "success",
                message: "Secret " + newSecret.metadata.name + " was created."
              });
              $scope.onCreate({newSecret: secret});
            }
          }, function(result) { // Failure
            var data = result.data || {};
            if (data.reason === 'AlreadyExists') {
              $scope.nameTaken = true;
              return;
            }
            NotificationsService.addNotification({
              id: "create-secret-error",
              type: "error",
              message: "An error occurred while creating the secret.",
              details: $filter('getErrorDetails')(result)
            });
          });
        };

        $scope.cancel = function() {
          hideErrorNotifications();
          $scope.onCancel();
        };
      }
    };
  });
