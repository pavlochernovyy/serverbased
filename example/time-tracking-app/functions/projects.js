// A function loaded via serverbased.json (see ../serverbased.json), mounted at /projects.
// Uses the same default "store" plugin the app's own top-level handlers get (see run() in
// lib/server-based.js) — auto-injected per function, its own fresh Map instance, isolated
// from the host app's store and from every other function's store.
const seedProjects = () => new Map();

const handlerListProjects = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const projects = context.conductState('projects') || seedProjects();
    context.provideReply({ data: [...projects.values()] }).send();
  },
};

const handlerCreateProject = {
  route: '/',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, name } = context.fetchRequest().body;
    const projects = context.conductState('projects') || seedProjects();
    const project = { id, name };
    projects.set(id, project);
    context.provideState('projects', projects);
    context.provideReply({ data: project }).sendWithCode(201);
  },
};

module.exports = { handlers: [handlerListProjects, handlerCreateProject] };
