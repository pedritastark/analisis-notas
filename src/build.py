tpl=open('app_template.html').read()
core=open('core.js').read().replace("if (typeof module !== 'undefined') module.exports = { readWorkbook, analizar, estructura, csvPerdidas, csvDetalle, csvResumen, csvConsolidado, pesosCorregidos };","")
ui=open('ui.js').read()
open('app.html','w').write(tpl.replace('/*__CORE__*/',core).replace('/*__UI__*/',ui))
