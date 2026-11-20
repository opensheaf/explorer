// Generated from literate/30-app.md by opensheaf-literate: edit the document, not this file.
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var attr = function (name) { return script.getAttribute('data-' + name); };
  var id = /^([a-z0-9]+(-[a-z0-9]+)*|sheaf:[a-z2-7]{52}:[a-z2-7]{51}[aq])$/;
  var owner = /^[a-z2-7]{51}[aq]$/;
  var explorer = new URL('./', script.src).href;
  var archive = new URL(attr('archive') || './', document.baseURI).href;
  var hash = '';
  if (attr('object') && id.test(attr('object'))) hash = '#/object/' + encodeURIComponent(attr('object'));
  else if (attr('collection') && id.test(attr('collection'))) hash = '#/collection/' + encodeURIComponent(attr('collection'));
  else if (attr('owner') && owner.test(attr('owner'))) hash = '#/owner/' + attr('owner');
  else if (script.hasAttribute('data-verify')) hash = '#/verify';
  var link = document.createElement('a');
  link.href = explorer + '?url=' + encodeURIComponent(archive) + hash;
  link.textContent = attr('label') || 'Explore this archive';
  link.className = 'opensheaf-explore';
  if (!script.hasAttribute('data-unstyled')) {
    var s = link.style;
    s.display = 'inline-block';
    s.padding = '0.3em 0.8em';
    s.border = '1px solid currentColor';
    s.borderRadius = '4px';
    s.textDecoration = 'none';
    s.font = 'inherit';
  }
  var target = attr('target') && document.getElementById(attr('target'));
  if (target) target.appendChild(link);
  else script.parentNode.insertBefore(link, script.nextSibling);
})();
