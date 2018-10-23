var auth = require('../../../lib/auth/auth_check')
var page_data = require('../../../lib/page_links')
var cft = require('../../../lib/reports/cft')
var projects = require('../../../lib/controllers/projects')
var moment = require('moment')
var throttledRequest = require('../../../config/throttled_request_promise')
const LPauth = "Basic " + new Buffer(process.env.LpUserName + ":" + process.env.LPPassword).toString("base64");
// set the sub dirs for the PS MRR Reporting Routes
var ps_workload_reports = '/ps/reports/workload'
module.exports = function (app, passport, express) {
 app.get(ps_workload_reports + '/', auth.basic, async function (req, res) {
  var builder = {}
  var buildRemainingURL = process.env.LP_BUILDER_REMAINING
  var buildLoggedURL = process.env.LP_BUILDER_LOGGED
  if (req.query.start_date && req.query.end_date) {
   var start_date = moment(req.query.start_date).format('YYYY-MM-DD')
   var end_date = moment(req.query.end_date).format('YYYY-MM-DD')
   // if start and end dates are set use those instead
   buildRemainingURL = buildRemainingURL + '?start_date=' + start_date + '&end_date=' + end_date
   buildLoggedURL = buildLoggedURL + '?start_date=' + start_date + '&end_date=' + end_date
  }
  // get the report of hours remaining 

  builder.remaining = await throttledRequest.promise({ url: buildRemainingURL, method: 'GET', headers: { "Authorization": LPauth } })
  // get the report of hours logged
  builder.logged = await throttledRequest.promise({ url: buildLoggedURL, method: 'GET', headers: { "Authorization": LPauth } })
  let link_data = page_data()

  builder.remaining.total_hours = 0
  builder.remaining.needs_scheduled = 0
  builder.logged.total_hours = 0
  builder.total_availableHours = 0

  // count the build teams remaining availability hours
  for (let i = 0; i < builder.logged.rows.length; i++) {
   //DO NOT COUNT NEEDS WIS OR NEEDS WIS CONTRACTOR 
   if (builder.logged.rows[i].name !== 'needs_WIS' || builder.logged.rows[i].name !== 'needs_WISContractor') {
    builder.remaining.total_hours = builder.remaining.total_hours + parseFloat(builder.logged.rows[i].hours_unscheduled)
   }
  }
  // count the needs wis and nees wis contract hours
  for (let i = 0; i < builder.remaining.rows.length; i++) {
   if (builder.remaining.rows[i].name === 'needs_WIS' || builder.remaining.rows[i].name === 'needs_WISContractor') {
    builder.remaining.needs_scheduled = builder.remaining.needs_scheduled + parseFloat(builder.remaining.rows[i].hours_remaining)
   }
  }
  // count the hours logged for the team
  for (let i = 0; i < builder.logged.rows.length; i++) {
   if (builder.logged.rows[i].name !== 'needs_WIS' || builder.logged.rows[i].name !== 'needs_WISContractor') {
    builder.logged.total_hours = builder.logged.total_hours + parseFloat(builder.logged.rows[i].hours_logged)
   }
  }

  // count the hours available for the build teams
  for (let i = 0; i < builder.logged.rows.length; i++) {
   //DO NOT COUNT NEEDS WIS OR NEEDS WIS CONTRACTOR 
   if (builder.logged.rows[i].name !== 'needs_WIS' || builder.logged.rows[i].name !== 'needs_WISContractor') {
    builder.total_availableHours = builder.total_availableHours + builder.logged.rows[i].hours_available
   }
  }
  // res.json(builder)
  res.render('pages/ps/reports/workload.ejs', { user: req.user, slug: 'wordload', lp_space_id: process.env.LPWorkspaceId, moment: moment, link_data: link_data, builder: builder })
 })
 app.get(ps_workload_reports + '/cft', auth.basic, async function (req, res) {
  let link_data = page_data()
  // get all teams
  var pods = await cft.getall()
  // get number of active projects per teams
  var activeProjects = await projects.count({ is_done: false, is_archived: false, is_on_hold: false })
  // get number of scheduled projects per team
  var scheduledProjects = {
   0: {
    projects: 2
   },
   44790301: {
    projects: 3
   },
   46132813: {
    projects: 3
   },
   46132814: {
    projects: 4
   },
   46132815: {
    projects: 2
   },
   46132816: {
    projects: 6
   },
   46132817: {
    projects: 4
   }
  }
  // get wip limit for each team
  var wipLimits = {
   0 : {
    limit: 10
   },
   44790301: {
    limit: 18
   },
   46132813: {
    limit: 12
   },
   46132814: {
    limit: 11
   },
   46132815: {
    limit: 9
   },
   46132816: {
    limit: 18
   },
   46132817: {
    limit: 13
   }
  }

  // transform and combine all of the data into one object

  // res.json(builder)
  res.render('pages/ps/reports/team_workload.ejs', { user: req.user, slug: 'team_wordload', lp_space_id: process.env.LPWorkspaceId, moment: moment, link_data: link_data, pods: pods, activeProjects: activeProjects, scheduledProjects: scheduledProjects, wipLimits: wipLimits })
 })
}