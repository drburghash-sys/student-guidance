/* Offline PDF export and print preview for iPhone/desktop. No third-party scripts or uploads. */
(function () {
  'use strict';
  var pdfReady = null;
  var pdfRequest = 0;
  var oldOverflow = '';

  function h(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function reportStyle() {
    if (document.getElementById('pdfReportStyles')) return;
    var style = document.createElement('style');
    style.id = 'pdfReportStyles';
    style.textContent = [
      '#pdfReportOverlay{position:fixed;inset:0;z-index:9999;background:#edf1f6;overflow:auto;overscroll-behavior:contain;padding:12px 12px 40px;padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(35px + env(safe-area-inset-bottom));direction:rtl;color:#111;font-family:Tahoma,Arial,sans-serif}',
      '#pdfReportOverlay .pdf-actions{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:9px;justify-content:center;align-items:center;max-width:1100px;margin:0 auto 12px;padding:12px;background:#fff;border:1px solid #d6dbe3;border-radius:14px;box-shadow:0 4px 14px #0001}',
      '#pdfReportOverlay .pdf-actions button{border:0;border-radius:9px;min-height:45px;padding:10px 14px;font:700 14px Tahoma,Arial,sans-serif;cursor:pointer}',
      '#pdfReportOverlay .pdf-actions button:disabled{opacity:.55;cursor:wait}',
      '#pdfReportOverlay .pdf-primary{background:#2456d9;color:white}',
      '#pdfReportOverlay .pdf-green{background:#16884c;color:white}',
      '#pdfReportOverlay .pdf-muted{background:#e5e7eb;color:#111}',
      '#pdfReportOverlay .pdf-status{flex-basis:100%;text-align:center;font-size:12px;color:#555;line-height:1.6}',
      '#pdfReportOverlay .pdf-paper{max-width:1100px;margin:auto;padding:18px;background:#fff;box-shadow:0 3px 15px #0001;overflow-x:auto}',
      '#pdfReportOverlay h1{text-align:center;font-size:20px;margin:0 0 6px}',
      '#pdfReportOverlay .pdf-meta{text-align:center;color:#555;font-size:12px;margin-bottom:12px}',
      '#pdfReportOverlay table{width:100%;min-width:850px;border-collapse:collapse;font-size:11px;direction:rtl}',
      '#pdfReportOverlay th,#pdfReportOverlay td{border:1px solid #888;padding:7px;text-align:right;vertical-align:top;overflow-wrap:anywhere}',
      '#pdfReportOverlay th{background:#e8edf4}',
      '#pdfReportOverlay tr{break-inside:avoid;page-break-inside:avoid}',
      '@media(max-width:600px){#pdfReportOverlay .pdf-actions button{flex:1 1 40%;font-size:13px}#pdfReportOverlay .pdf-paper{padding:8px}}',
      '@media print{@page{size:A4 landscape;margin:10mm}body{background:white!important;padding:0!important;margin:0!important}body>.app{display:none!important}#pdfReportOverlay{position:static!important;display:block!important;background:white!important;padding:0!important;overflow:visible!important}#pdfReportOverlay .pdf-actions{display:none!important}#pdfReportOverlay .pdf-paper{max-width:none!important;padding:0!important;box-shadow:none!important;overflow:visible!important}#pdfReportOverlay table{min-width:0!important;width:100%!important;font-size:9px!important}#pdfReportOverlay th,#pdfReportOverlay td{padding:4px!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function closeReport() {
    var el = document.getElementById('pdfReportOverlay');
    if (el) el.remove();
    document.body.style.overflow = oldOverflow;
    pdfReady = null;
    pdfRequest++;
  }

  function downloadPDF() {
    if (!pdfReady) return alert('يجري تجهيز PDF، انتظر قليلًا.');
    var url = URL.createObjectURL(pdfReady.blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = pdfReady.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function sharePDF() {
    if (!pdfReady) return alert('يجري تجهيز PDF، انتظر قليلًا.');
    var file = new File([pdfReady.blob], pdfReady.filename, {type:'application/pdf'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
      // User gesture is preserved: sharing begins directly from this button click.
      navigator.share({files:[file],title:'تقرير الموجهة الطلابية'}).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        downloadPDF();
      });
    } else {
      downloadPDF();
    }
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var result = [];
    var sourceLines = String(text == null ? '' : text).split(/\r?\n/);
    for (var j = 0; j < sourceLines.length; j++) {
      var words = sourceLines[j].split(/\s+/);
      var line = '';
      for (var k = 0; k < words.length; k++) {
        var word = words[k];
        var parts = [];
        if (ctx.measureText(word).width > maxWidth) {
          var chunk = '';
          for (var ch of Array.from(word)) {
            if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
              parts.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          if (chunk) parts.push(chunk);
        } else parts.push(word);
        for (var part of parts) {
          var trial = line ? line + ' ' + part : part;
          if (line && ctx.measureText(trial).width > maxWidth) {
            result.push(line);
            line = part;
          } else line = trial;
        }
      }
      result.push(line);
    }
    return result.length ? result : [''];
  }

  function reportWeights(cols) {
    var weights = {
      name:2.0, grade:1.0, classroom:.8, phone:1.5, day:1.0, date:1.15,
      type:1.6, minutes:1.0, notes:2.1, action:2.1, problem:2, plan:2,
      reason:2, result:2, audience:1.5, status:1.15, count:1,
      teacher:1.2, subject:1.2, lives:1.55, excuse:1.1,
      degree:1.0, repeat:1.0, priority:1, level:1, follow:1
    };
    return cols.map(function (c) { return weights[c[0]] || 1.25; });
  }

  function pdfFromImages(images, imageWidth, imageHeight) {
    var enc = new TextEncoder();
    var objects = [null, null];
    var pageIds = [];
    function add(obj) { objects.push(obj); return objects.length; }
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var imId = add({
        prefix:'<< /Type /XObject /Subtype /Image /Width ' + imageWidth + ' /Height ' + imageHeight +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>',
        bytes:img
      });
      var content = enc.encode('q 841.89 0 0 595.28 0 0 cm /Image' + i + ' Do Q\n');
      var contentId = add({prefix:'<< /Length ' + content.length + ' >>',bytes:content});
      var pageId = add({text:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Image' +
        i + ' ' + imId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>'});
      pageIds.push(pageId);
    }
    objects[0] = {text:'<< /Type /Catalog /Pages 2 0 R >>'};
    objects[1] = {text:'<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + pageIds.length + ' >>'};
    var chunks = [];
    var offsets = [0];
    var total = 0;
    function push(bytes) { chunks.push(bytes); total += bytes.length; }
    function pushStr(s) { push(enc.encode(s)); }
    pushStr('%PDF-1.4\n');
    for (var n = 0; n < objects.length; n++) {
      offsets.push(total);
      pushStr((n + 1) + ' 0 obj\n');
      var o = objects[n];
      if (o.bytes) {
        pushStr(o.prefix + '\nstream\n');
        push(o.bytes);
        pushStr('\nendstream\n');
      } else pushStr(o.text + '\n');
      pushStr('endobj\n');
    }
    var xref = total;
    pushStr('xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n');
    for (var x = 1; x < offsets.length; x++) pushStr(String(offsets[x]).padStart(10,'0') + ' 00000 n \n');
    pushStr('trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(chunks,{type:'application/pdf'});
  }

  function createReportPDF(def, rows) {
    // Browser Canvas shapes Arabic text correctly, unlike PDF built-in Latin fonts.
    var W = 1122, H = 794, scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    var ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.direction = 'rtl';
    ctx.textBaseline = 'top';
    var cols = def.cols;
    var weights = reportWeights(cols);
    var available = W - 64;
    var sum = weights.reduce(function (a,b) { return a+b; },0);
    var widths = weights.map(function (v) { return v * available / sum; });
    // RTL layout: the first (student-name) column begins at the RIGHT page margin.
    // Move left after each column; preserve the source order and every record value.
    var lefts = [], rightEdge = W - 32;
    for (var i=0;i<widths.length;i++) { rightEdge -= widths[i]; lefts.push(rightEdge); }
    var images=[], y=0, page=0, rowCounter=0, bottom=748;
    var lineH=18, padding=7;

    function drawText(text,x,y,font,color,align) {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = align || 'right';
      ctx.fillText(text,x,y);
    }
    function rect(x,y,w,h,fill,stroke) {
      if(fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.strokeRect(x,y,w,h);}
    }
    function startPage() {
      page++;
      rect(0,0,W,H,'#ffffff',null);
      drawText(def.title,W/2,25,'bold 24px Tahoma,Arial,sans-serif','#192235','center');
      drawText(def.code + ' — تاريخ التقرير: ' + today(),W/2,62,'14px Tahoma,Arial,sans-serif','#555','center');
      drawText('صفحة ' + page,W-32,769,'12px Tahoma,Arial,sans-serif','#666','right');
      y=103;
      ctx.font='bold 12px Tahoma,Arial,sans-serif';
      var labelLines=cols.map(function (c,i) { return wrapCanvasText(ctx,c[1],widths[i]-14); });
      var headingH=Math.max(38,Math.max.apply(null,labelLines.map(function (a) { return a.length; }))*17+14);
      for(var i=0;i<cols.length;i++){
        rect(lefts[i],y,widths[i],headingH,'#e9eff7','#888');
        labelLines[i].forEach(function (line,k) {
          drawText(line,lefts[i]+widths[i]-padding,y+7+k*17,'bold 12px Tahoma,Arial,sans-serif','#111','right');
        });
      }
      y+=headingH;
    }
    function savePage(){
      var encoded = canvas.toDataURL('image/jpeg',.87).split(',')[1];
      var raw=atob(encoded),bytes=new Uint8Array(raw.length);
      for(var n=0;n<raw.length;n++)bytes[n]=raw.charCodeAt(n);
      images.push(bytes);
    }

    startPage();
    for (var r=0;r<rows.length;r++) {
      ctx.font='13px Tahoma,Arial,sans-serif';
      var cells=rows[r].map(function (value,i) { return wrapCanvasText(ctx,value,widths[i]-14); });
      var index=0, maxLines=Math.max.apply(null,cells.map(function (a) { return a.length; }));
      while(index<maxLines){
        var capacity=Math.floor((bottom-y-2*padding)/lineH);
        if(capacity<1){savePage();startPage();continue;}
        var count=Math.min(capacity,maxLines-index);
        var height=count*lineH+2*padding;
        for(var c=0;c<cols.length;c++){
          rect(lefts[c],y,widths[c],height,rowCounter%2===0?'#ffffff':'#f7f9fc','#888');
          var cut=cells[c].slice(index,index+count);
          cut.forEach(function (line,li) {
            drawText(line,lefts[c]+widths[c]-padding,y+padding+li*lineH,'13px Tahoma,Arial,sans-serif','#222','right');
          });
        }
        y+=height;
        index+=count;
        if(index<maxLines){savePage();startPage();}
      }
      rowCounter++;
    }
    savePage();
    return pdfFromImages(images,canvas.width,canvas.height);
  }

  window.showPdfReport = function(section) {
    var def=exportDefs[section],rows=rowsFor(section);
    if(!rows.length){alert('لا توجد بيانات للتصدير');return false;}
    closeReport();
    var token=++pdfRequest;
    reportStyle();
    oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    var view=document.createElement('div');
    view.id='pdfReportOverlay';
    view.setAttribute('role','dialog');
    view.setAttribute('aria-label','معاينة تقرير ' + def.title);
    var headers=def.cols.map(function(c){return '<th>'+h(c[1])+'</th>';}).join('');
    var body=rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+h(v)+'</td>';}).join('')+'</tr>';}).join('');
    view.innerHTML='<div class="pdf-actions">' +
      '<button type="button" class="pdf-primary" id="pdfShare" disabled>مشاركة / حفظ PDF</button>' +
      '<button type="button" class="pdf-green" id="pdfDownload" disabled>تنزيل PDF</button>' +
      '<button type="button" class="pdf-muted" id="pdfPrint">طباعة</button>' +
      '<button type="button" class="pdf-muted" id="pdfClose">رجوع</button>' +
      '<div class="pdf-status" id="pdfStatus" role="status">جارٍ تجهيز ملف PDF…</div></div>' +
      '<div class="pdf-paper"><h1>'+h(def.title)+'</h1><div class="pdf-meta">'+h(def.code)+' — تاريخ التقرير: '+h(today())+'</div>' +
      '<table dir="rtl"><thead><tr>'+headers+'</tr></thead><tbody>'+body+'</tbody></table></div>';
    document.body.appendChild(view);
    view.querySelector('#pdfClose').addEventListener('click',closeReport);
    view.querySelector('#pdfPrint').addEventListener('click',function(){window.print();});
    view.querySelector('#pdfShare').addEventListener('click',sharePDF);
    view.querySelector('#pdfDownload').addEventListener('click',downloadPDF);
    setTimeout(function(){
      if(token!==pdfRequest)return;
      try {
        var blob=createReportPDF(def,rows);
        if(token!==pdfRequest)return;
        pdfReady={blob:blob,filename:def.code+'_'+today()+'.pdf'};
        view.querySelector('#pdfShare').disabled=false;
        view.querySelector('#pdfDownload').disabled=false;
        view.querySelector('#pdfStatus').textContent='ملف PDF جاهز. على iPhone استخدم «مشاركة / حفظ PDF» ثم «حفظ في الملفات».';
      } catch(err){
        console.error('Report PDF error:',err);
        view.querySelector('#pdfStatus').textContent='تعذّر تجهيز PDF على هذا الجهاز. جرّب زر «طباعة» أو افتح البرنامج في Safari.';
      }
    },60);
    return true;
  };
})();