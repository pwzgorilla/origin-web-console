'use strict';

(function() {

  angular
    .module('openshiftConsole')
    // shim for communicationg with pfNotificationDrawer
    .component('notificationDrawerWrapper', {
      templateUrl: 'views/directives/notifications/notification-drawer-wrapper.html',
      controller: [
        '$filter',
        '$interval',
        '$location',
        '$rootScope',
        '$routeParams',
        '$scope',
        '$timeout',
        'APIService',
        'Constants',
        'DataService',
        'NotificationsService',
        'EventsService',
        'NotificationsService',
        NotificationDrawerWrapper
      ]
    });

  function NotificationDrawerWrapper(
      $filter,
      $interval,
      $location,
      $rootScope,
      $routeParams,
      $scope,
      $timeout,
      APIService,
      Constants,
      DataService,
      NotificationsService,
      EventsService) {

      var eventsVersion = APIService.getPreferredVersion('events');
      var projectsVersion = APIService.getPreferredVersion('projects');

      // kill switch if watching events is too expensive
      var DISABLE_GLOBAL_EVENT_WATCH = _.get(Constants, 'DISABLE_GLOBAL_EVENT_WATCH');
      var LIMIT_WATCHES = $filter('isIE')();
      var DRAWER_EXPANDED_STORAGE_KEY = 'openshift/notification-drawer-expanded';

      var drawer = this;

      // global event watches
      var rootScopeWatches = [];
      // this one is treated separately from the rootScopeWatches as
      // it may need to be updated outside of the lifecycle of init/destroy
      var notificationListener;
      // our internal notifications
      // var clientGeneratedNotifications = [];

      var eventsWatcher;
      var eventsMap = {};

      // TODO:
      // include both Notifications & Events,
      // rather than destroying the map each time maintain it & add new items

      // final Processed set of notification groups for UI
      // IF POSSIBLE, avoid having to convert back to an array.
      // var notificationGroupsMap = {};
      var notificationGroups = [];


      var projects = {};

      var getProject = function(projectName) {
        return DataService
                .get(projectsVersion, projectName, {}, {errorNotification: false})
                .then(function(project) {
                  projects[project.metadata.name] = project;
                  return project;
                });
      };

      var ensureProjectGroupExists = function(groups, projectName) {
        if(projectName && !groups[projectName]) {
          groups[projectName] = {
            heading: $filter('displayName')(projects[projectName]) || projectName,
            project: projects[projectName],
            notifications: []
          };
        }
      };

      var deregisterEventsWatch = function() {
        if(eventsWatcher) {
          DataService.unwatch(eventsWatcher);
        }
      };

      var watchEvents = function(projectName, cb) {
        deregisterEventsWatch();
        if(projectName) {
          eventsWatcher = DataService.watch('events', {namespace: projectName}, _.debounce(cb, 400), { skipDigest: true });
        }
      };

      // NotificationService notifications are minimal, they do no necessarily contain projectName info.
      // ATM tacking this on via watching the current project.
      // var watchNotifications = function(projectName, cb) {
      //   deregisterNotificationListener();
      //   if(!projectName) {
      //     return;
      //   }
      //   notificationListener = $rootScope.$on('NotificationsService.onNotificationAdded', cb);
      // };

      var deregisterNotificationListener = function() {
        notificationListener && notificationListener();
        notificationListener = null;
      };

      var unread = function(notifications) {
        return _.filter(notifications, 'unread');
      };

      // returns a count for each type of notification, example:
      // {Normal: 1, Warning: 5}
      // TODO: eliminate this $rootScope.$applyAsync,
      // there is a quirk here where the values are not picked up the
      // first time the function runs, despite the same $applyAsync
      // in the render() function
      var countUnreadNotificationsForGroup = function(group) {
        $rootScope.$applyAsync(function() {
          group.totalUnread = unread(group.notifications).length;
          group.hasUnread = !!group.totalUnread;
          $rootScope.$emit('NotificationDrawerWrapper.count', group.totalUnread);
        });
      };

      var removeNotificationFromGroup = function(notification) {
        _.each(drawer.notificationGroups, function(group) {
          _.remove(group.notifications, { uid: notification.uid, namespace: notification.namespace });
        });
      };

      var formatAPIEvents = function(apiEvents) {
        return _.map(apiEvents, function(event) {
          return {
            actions: null,
            uid: event.metadata.uid,
            trackByID: event.metadata.uid,
            unread: !EventsService.isRead(event.metadata.uid),
            type: event.type,
            lastTimestamp: event.lastTimestamp,
            firstTimestamp: event.firstTimestamp,
            event: event
          };
        });
      };

      var sortNotifications = function(notifications) {
        return _.orderBy(notifications, ['event.lastTimestamp', 'event.firstTimestamp'], ['desc', 'desc']);
      };

      var sortNotificationGroups = function(groupsMap) {
        // convert the map into a sorted array
        var sortedGroups = _.sortBy(groupsMap, function(group) {
          return group.heading;
        });
        // and sort the notifications under each one
        _.each(sortedGroups, function(group) {
          group.notifications = sortNotifications(group.notifications);
          group.counts = countUnreadNotificationsForGroup(group);
        });
        return sortedGroups;
      };

      var formatAndFilterEvents = function(eventMap) {
        var filtered = {};
        ensureProjectGroupExists(filtered, $routeParams.project);
        _.each(eventMap, function(event) {
          if(EventsService.isImportantEvent(event) && !EventsService.isCleared(event)) {
            ensureProjectGroupExists(filtered, event.metadata.namespace);
            filtered[event.metadata.namespace].notifications.push({
              unread:  !EventsService.isRead(event),
              uid: event.metadata.uid,
              event: event,
              actions: null
            });
          }
        });
        return filtered;
      };

      var deregisterRootScopeWatches = function() {
        _.each(rootScopeWatches, function(deregister) {
          deregister();
        });
        rootScopeWatches = [];
      };

      var hideIfNoProject = function(projectName) {
        if(!projectName) {
          drawer.drawerHidden = true;
        }
      };

      var render = function() {
        $rootScope.$evalAsync(function () {
          countUnreadNotificationsForAllGroups();
          // NOTE: we are currently only showing one project in the drawer at a
          // time. If we go back to multiple projects, we can eliminate the filter here
          // and just pass the whole array as notificationGroups.
          // if we do, we will have to handle group.open to keep track of what the
          // user is viewing at the time & indicate to the user that the non-active
          // project is "asleep"/not being watched.
          drawer.notificationGroups = _.filter(notificationGroups, function(group) {
            return group.project.metadata.name === $routeParams.project;
          });
        });
      };

      // TODO: follow-on PR to decide which of these events to toast,
      // via config in constants.js
      var eventWatchCallback = function(eventData) {
        eventsMap = formatAndFilterEvents(eventData.by('metadata.uid'));
        // TODO: Update to an intermediate map, so that we can then combine both
        // events + notifications into the final notificationGroups output
        notificationGroups = sortNotificationGroups(eventsMap);
        render();
      };

      var notificationWatchCallback = function(event, notification) {
        if(!notification.showInDrawer) {
          return;
        }
        var project = notification.namespace || $routeParams.project;
        var id = notification.id || _.uniqueId('notification_') + Date.now();
        notificationsMap[project] = notificationsMap[project] || {};
        notificationsMap[project][id] = {
          actions: notification.actions,
          unread: !EventsService.isRead(id),
          // using uid to match API events and have one filed to pass
          // to EventsService for read/cleared, etc
          trackByID: notification.trackByID,
          uid: id,
          type: notification.type,
          // API events have both lastTimestamp & firstTimestamp,
          // but we sort based on lastTimestamp first.
          lastTimestamp: notification.timestamp,
          message: notification.message,
          isHTML: notification.isHTML,
          details: notification.details,
          namespace: project,
          links: notification.links
        };
        render();
      };

      var watchEvents = function(projectName, cb) {
        deregisterAPIEventsWatch();
        if(projectName) {
          apiEventsWatcher = DataService.watch(eventsVersion, {namespace: projectName}, _.debounce(cb, 400), { skipDigest: true });
        }
      };

      var watchNotifications = _.once(function(projectName, cb) {
        deregisterNotificationListener();
        notificationListener = $rootScope.$on('NotificationsService.onNotificationAdded', cb);
      });

      var reset = function() {
        getProject($routeParams.project).then(function() {
          watchEvents($routeParams.project, apiEventWatchCallback);
          watchNotifications($routeParams.project, notificationWatchCallback);
          hideIfNoProject($routeParams.project);
          render();
        });
      };

      angular.extend(drawer, {
        drawerHidden: true,
        allowExpand: true,
        drawerExpanded: localStorage.getItem(DRAWER_EXPANDED_STORAGE_KEY) === 'true',
        drawerTitle: 'Notifications',
        hasUnread: false,
        showClearAll: true,
        showMarkAllRead: true,
        onClose: function() {
          drawer.drawerHidden = true;
        },
        onMarkAllRead: function(group) {
          _.each(group.notifications, function(notification) {
            notification.unread = false;
            EventsService.markRead(notification.event);
          });
          render();
          $rootScope.$emit('NotificationDrawerWrapper.onMarkAllRead');
        },
        onClearAll: function(group) {
          _.each(group.notifications, function(notification) {
            EventsService.markRead(notification.event);
            EventsService.markCleared(notification.event);
          });
          group.notifications = [];
          render();
          $rootScope.$emit('NotificationDrawerWrapper.onMarkAllRead');
        },
        notificationGroups: notificationGroups,
        headingInclude: 'views/directives/notifications/header.html',
        notificationBodyInclude: 'views/directives/notifications/notification-body.html',
        customScope: {
          clear: function(notification, index, group) {
            EventsService.markCleared(notification.event);
            group.notifications.splice(index, 1);
            countUnreadNotificationsForAllGroups();
          },
          markRead: function(notification) {
            notification.unread = false;
            EventsService.markRead(notification.event);
            countUnreadNotificationsForAllGroups();
          },
          getNotficationStatusIconClass: function(event) {
            return iconClassByEventSeverity[event.type] || iconClassByEventSeverity.info;
          },
          getStatusForCount:  function(countKey) {
            return iconClassByEventSeverity[countKey] || iconClassByEventSeverity.info;
          },
          close: function() {
            drawer.drawerHidden = true;
          },
          countUnreadNotifications: countUnreadNotifications
        }
      });

      $scope.$watch('$ctrl.drawerExpanded', function(expanded) {
        localStorage.setItem(DRAWER_EXPANDED_STORAGE_KEY, expanded ? 'true' : 'false');
      });

      var initWatches = function() {
        if($routeParams.project) {
          reset();
        }
        // $routeChangeSuccess seems more reliable than $locationChangeSuccess:
        // - it fires once on initial load. $locationChangeSuccess does not.
        // - it waits for more object resolution (not a huge deal in this use case)
        // - tracks route data instead of urls (args to callback fn, also not
        //   necessary for the current use case)
        rootScopeWatches.push($rootScope.$on("$routeChangeSuccess", function (evt, next, current) {
          if(projectChanged(next, current)) {
            drawer.customScope.projectName = $routeParams.project;
            reset();
          }
        }));

        // event from the counter to signal the drawer to open/close
        rootScopeWatches.push($rootScope.$on('NotificationDrawerWrapper.toggle', function() {
          drawer.drawerHidden = !drawer.drawerHidden;
        }));

        // event to signal the drawer to close
        rootScopeWatches.push($rootScope.$on('NotificationDrawerWrapper.hide', function() {
          drawer.drawerHidden = true;
        }));

        // event to signal the drawer to clear a notification
        rootScopeWatches.push($rootScope.$on('NotificationDrawerWrapper.clear', function(event, notification) {
          EventsService.markCleared(notification.uid);
          removeNotificationFromGroup(notification);
          drawer.countUnreadNotifications();
        }));
      };

      drawer.$onInit = function() {
        if(DISABLE_GLOBAL_EVENT_WATCH || LIMIT_WATCHES) {
          return;
        }
        initWatches();
      };

      drawer.$onDestroy = function() {
        deregisterNotificationListener();
        deregisterEventsWatch();
        deregisterRootScopeWatches();
      };

  }

})();
