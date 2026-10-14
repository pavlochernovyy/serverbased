const { ProjectsStorePlugin } = require('./plugins/projects-store.plugin');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /projects.
// Overrides the default "store" plugin with ProjectsStorePlugin
// (functions/plugins/projects-store.plugin.js) — no per-handler seedProjects() fallback needed.
const handlerListProjects = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const projects = context.conductState('projects');
    context.provideReply({ data: [...projects.values()] }).send();
  },
};

const handlerCreateProject = {
  route: '/',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, name } = context.fetchRequest().body;
    const projects = context.conductState('projects');
    const project = { id, name };
    projects.set(id, project);
    context.provideState('projects', projects);
    context.provideReply({ data: project }).sendWithCode(201);
  },
};

module.exports = {
  handlers: [handlerListProjects, handlerCreateProject],
  plugins: [{ name: 'store', plugin: ProjectsStorePlugin }],
};
