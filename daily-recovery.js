/* Private daily-record recovery. Student names are encrypted in daily-recovery.enc.json.
   The secret key is never committed, requested by a server, or stored on device. */
(function(){
  'use strict';
  const DB_KEY='student_guidance_unified_v2';
  const SOURCE='recovered-photo-20261021-';
  const REVIEW_NOTE='مستعاد من صورة تقرير المواقف اليومية بتاريخ ٢١ أكتوبر ٢٠٢٦. ';
  const toBytes=(b64)=>{
    const raw=atob(b64.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(b64.length/4)*4,'='));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  };
  const dayOf=date=>{
    const a=date.split('-').map(Number);
    const names=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    return names[new Date(a[0],a[1]-1,a[2],12).getDay()];
  };
  async function decodeWithPrivateKey(secret) {
    if(!globalThis.crypto || !crypto.subtle || !globalThis.DecompressionStream){
      throw new Error('متصفح الآيفون قديم أو لا يدعم فك تشفير ملف الاستعادة. افتح الموقع في Safari بعد تحديث iOS.');
    }
    const response=await fetch('./daily-recovery.enc.json',{cache:'no-store'});
    if(!response.ok)throw new Error('تعذر تحميل ملف الاستعادة المشفّر من GitHub.');
    const pack=await response.json();
    if(pack.algo!=='AES-256-GCM+deflate'||pack.record_count!==12)throw new Error('صيغة ملف الاستعادة غير متوقعة.');
    let bytes;
    try{
      const imported=await crypto.subtle.importKey('raw',toBytes(secret),{name:'AES-GCM'},false,['decrypt']);
      bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:toBytes(pack.iv),additionalData:new TextEncoder().encode(pack.context)},imported,toBytes(pack.ciphertext));
    }catch(e){throw new Error('مفتاح الاستعادة غير صحيح. انسخه كاملًا كما أُرسل إليك.');}
    const decoded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
    const payload=JSON.parse(decoded);
    if(payload.schema!=='sg-recovery-v1'||!Array.isArray(payload.records)||payload.records.length!==12){
      throw new Error('ملف الاستعادة لا يحتوي على السجلات المتوقعة.');
    }
    return payload.records.map((r,i)=>{
      if(!Array.isArray(r)||r.length!==6||!r.slice(0,5).every(v=>typeof v==='string'))throw new Error('بيانات سجل غير صالحة.');
      return {id:SOURCE+String(i+1).padStart(2,'0'),name:r[0],grade:r[1],classroom:r[2],
        date:r[3],day:r[3]?dayOf(r[3]):'الاثنين',type:r[4],phone:'',minutes:'',
        notes:REVIEW_NOTE+(r[5]?'يرجى مطابقة الاسم والتفاصيل مع الصورة الأصلية. ':'')+(!r[3]?'التاريخ غير ظاهر في الصورة.':'')};
    });
  }
  function restoreStore(records) {
    const previous=localStorage.getItem(DB_KEY);
    let current;
    try{current=previous?JSON.parse(previous):null;}catch{throw new Error('التخزين الحالي غير صالح؛ أوقفنا الاستعادة لحماية البيانات.');}
    if(current!==null&&(typeof current!=='object'||Array.isArray(current)))throw new Error('تنسيق قاعدة البيانات الحالية غير معروف.');
    const olddb=current||{daily:[],attendance:[],behavior:[],health:[],social:[],material:[],events:[],guardians:[],followup:[],honor:[],academic:[]};
    if(!Array.isArray(olddb.daily))throw new Error('قائمة المواقف الحالية غير صالحة؛ لم نغيّر شيئًا.');
    const existingIds=new Set(olddb.daily.map(r=>String(r.id)));
    const same=r=>olddb.daily.some(x=>x.name===r.name&&x.date===r.date&&x.type===r.type&&x.classroom===r.classroom);
    const toAdd=records.filter(r=>!existingIds.has(String(r.id))&&!same(r));
    if(!toAdd.length)return {added:0,total:olddb.daily.length};
    // Retain a local snapshot of all existing sections, so restoration never overwrites them.
    const backupName='student_guidance_before_photo_restore_'+Date.now();
    localStorage.setItem(backupName,previous||JSON.stringify(olddb));
    const merged={...olddb,daily:[...toAdd,...olddb.daily]};
    const serial=JSON.stringify(merged);
    localStorage.setItem(DB_KEY,serial);
    if(localStorage.getItem(DB_KEY)!==serial)throw new Error('فشل التأكد من حفظ السجلات على الآيفون.');
    db=merged;
    renderAll();
    return {added:toAdd.length,total:merged.daily.length};
  }
  async function onRestore(){
    const btn=document.getElementById('photoRecoveryGo');
    const keyInput=document.getElementById('photoRecoveryKey');
    const status=document.getElementById('photoRecoveryStatus');
    const secret=(keyInput.value||'').trim();
    if(!secret){status.textContent='ألصق مفتاح الاستعادة الخاص أولًا.';return;}
    btn.disabled=true;
    status.textContent='جاري فك التشفير والتأكد من السجلات…';
    try{
      const records=await decodeWithPrivateKey(secret);
      const result=restoreStore(records);
      keyInput.value='';
      status.textContent=result.added
        ?'نجحت الاستعادة: تمت إضافة '+result.added+' سجلًا إلى «المواقف اليومية» دون حذف الأقسام الأخرى. يوصى بتصدير نسخة احتياطية JSON.'
        :'لم تُضف سجلات جديدة: هذه السجلات موجودة بالفعل، ولم نكررها.';
      status.style.color='#166534';
      if(result.added)alert('تمت إضافة '+result.added+' سجلًا إلى المواقف اليومية. بعض الأسماء تحتاج مراجعة من الصورة الأصلية.');
    }catch(e){
      status.textContent='لم تُجرَ أي استعادة: '+(e.message||String(e));
      status.style.color='#991b1b';
    }finally{btn.disabled=false;}
  }
  function mount(){
    const page=document.getElementById('daily');
    const panel=page&&page.querySelector('.panel');
    if(!panel||document.getElementById('photoRecoveryBlock'))return;
    const section=document.createElement('div');
    section.id='photoRecoveryBlock';
    section.style.cssText='margin:14px 0;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;direction:rtl';
    section.innerHTML='<div style="font-weight:700;margin-bottom:8px">استعادة ١٢ سجلًا من صورة المواقف اليومية</div>'+
      '<p style="font-size:12px;margin:0 0 10px">البيانات محفوظة بشكل مشفّر على GitHub. أدخل مفتاح الاستعادة الخاص لإضافتها على هذا الجهاز فقط، دون مسح السجلات الحالية أو الأقسام الأخرى.</p>'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px">'+
      '<input id="photoRecoveryKey" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="الصق مفتاح الاستعادة الخاص" style="flex:1;min-width:190px;padding:12px;border:1px solid #94a3b8;border-radius:8px;direction:ltr;text-align:left">'+
      '<button type="button" id="photoRecoveryGo" class="btn btn-primary">استعادة السجلات</button></div>'+
      '<p id="photoRecoveryStatus" role="status" style="font-size:13px;margin:8px 0 0">السجلات المستعادة من صورة وليست نسخة كاملة من البيانات القديمة؛ راجع الأسماء غير الواضحة.</p>';
    panel.insertBefore(section,panel.children[1]||null);
    section.querySelector('#photoRecoveryGo').addEventListener('click',onRestore);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();