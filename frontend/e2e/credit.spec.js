const {test,expect}=require('@playwright/test');

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  const settingsReady=page.waitForResponse(response=>response.url().endsWith('/api/settings') && response.ok());
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/$/);
  await settingsReady;
}
async function shot(page,path) {
  await page.evaluate(async()=>{document.activeElement?.blur();await document.fonts.ready;scrollTo(0,0);});
  await page.screenshot({path,fullPage:true,animations:'disabled'});
}
test('customer credit: opening balance, sale, repayment, statement and reversal',async({page,isMobile},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await signIn(page);await page.locator('main a[href="/credit"]').click();
  await page.getByRole('button',{name:'Add customer',exact:true}).click();
  const name=`Ahmed Traders ${info.project.name} ${Date.now()}`;
  await page.getByLabel('Customer name').fill(name);await page.getByLabel('Phone number').fill('+923001234567');
  await page.getByText('Already owes you money?',{exact:true}).click();
  await page.getByLabel('Existing balance').fill('1000');
  await page.getByRole('button',{name:'Add customer',exact:true}).last().click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await expect(page.locator('.credit-account-balance strong')).toContainText('1,000');
  await page.getByRole('button',{name:'New credit sale',exact:true}).click();
  await page.getByRole('button',{name:/^Product/}).click();
  await page.getByRole('option',{name:/Premium Basmati/}).click();
  await page.getByLabel(/^Quantity/).fill('2');
  await page.getByLabel('Price per unit').fill('15');
  await page.getByLabel('Received now').fill('5');
  await page.getByLabel('Payment due date').fill('2030-01-15');
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.credit-account-balance strong')).toContainText('1,025');
  await page.getByRole('button',{name:'Record repayment',exact:true}).click();
  await page.getByLabel(/^Amount received/).fill('125');
  await page.getByRole('button',{name:'Payment method'}).click();await page.getByRole('option',{name:'Bank transfer',exact:true}).click();
  await page.getByText('Reference & notes', { exact: true }).click();
  await page.getByLabel('Reference',{exact:true}).fill('BANK-125');
  await page.getByRole('button',{name:'Record repayment',exact:true}).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.credit-account-balance strong')).toContainText('900');
  await expect(page.locator('.credit-history')).toContainText('BANK-125');
  if(isMobile) {
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
    const repay=await page.getByRole('button',{name:'Record repayment',exact:true}).boundingBox();
    const dock=await page.getByRole('navigation',{name:'Primary',exact:true}).boundingBox();
    expect(repay.y+repay.height).toBeLessThanOrEqual(dock.y);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await shot(page,`test-results/credit-${info.project.name}.png`);
  if(!isMobile) {
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Statement',exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toMatch(/statement.*\.pdf$/);
    await file.saveAs('test-results/credit-statement.pdf');
  }
  await page.getByRole('button',{name:/Reverse payment of/}).click();
  await page.getByLabel('Reason for reversal').fill('Wrong payment reference');
  await page.getByRole('button',{name:'Reverse repayment',exact:true}).click();
  await expect(page.locator('.credit-account-balance strong')).toContainText('1,025');
  await expect(page.locator('.credit-history')).toContainText('Repayment reversed');
  await page.getByRole('button',{name:'Edit customer',exact:true}).click();
  await page.getByLabel('Customer name').fill(name+' updated');await page.getByRole('button',{name:'Save customer',exact:true}).click();
  await expect(page.getByRole('heading',{name:name+' updated',exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('rim.theme','dark'));await page.reload();
  await expect(page.locator('.credit-account-balance strong')).toContainText('1,025');
  await shot(page,`test-results/credit-dark-${info.project.name}.png`);
  const ur=require('../src/i18n/ur.json');
  await page.locator('.language-trigger').first().click();
  await page.getByRole('menuitem').filter({hasText:'اردو'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.locator('.credit-history')).toContainText(ur['Repayment reversed']);
  await expect(page.locator('.credit-account')).toContainText(ur['Outstanding balance']);
  await shot(page,`test-results/credit-urdu-${info.project.name}.png`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('camera preview recovers when autoplay is denied and releases capture',async({page,isMobile})=>{
  test.skip(isMobile,'Synthetic canvas video capture requires Chromium; WebKit receives the UI workflow checks.');
  await signIn(page);
  await page.locator('a[href="/barcodes"]').filter({visible:true}).first().click();
  await page.evaluate(()=>{
    const originalPlay=HTMLMediaElement.prototype.play;
    let blocked=false;
    HTMLMediaElement.prototype.play=function(){
      if(this.srcObject && !blocked){blocked=true;return Promise.reject(new DOMException('Gesture required','NotAllowedError'));}
      return originalPlay.call(this);
    };
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      const ctx=canvas.getContext('2d');const paint=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,640,480);};paint();
      const timer=setInterval(paint,100);const stream=canvas.captureStream(10);
      window.__creditCameraStream=stream;stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
    }});
  });
  await page.getByRole('button',{name:'Read label',exact:true}).click();
  await page.getByRole('button',{name:'Use camera',exact:true}).click();
  await page.getByRole('button',{name:'Start camera preview',exact:true}).click();
  await expect(page.getByText('Looking for a barcode…',{exact:true})).toBeVisible();
  expect(await page.locator('video').evaluate(v=>v.muted && v.playsInline && v.videoWidth>0 && !v.paused)).toBe(true);
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
  expect(await page.evaluate(()=>window.__creditCameraStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('customers can be archived and restored without losing dues or Urdu statements', async ({page,isMobile},info) => {
  await signIn(page);await page.goto('/credit');
  await page.getByRole('button',{name:'Add customer',exact:true}).click();
  const name=`احمد رائس ٹریڈرز ${info.project.name} ${Date.now()}`;
  await page.getByLabel('Customer name').fill(name);
  await page.getByText('Already owes you money?',{exact:true}).click();
  await page.getByLabel('Existing balance').fill('100');
  await page.getByRole('button',{name:'Add customer',exact:true}).last().click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Archive customer',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Archive customer',exact:true}).click();
  await expect(page.getByRole('button',{name:'Restore customer',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'New credit sale',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Record repayment',exact:true})).toBeEnabled();
  await expect(page.locator('.credit-account-balance strong')).toContainText('100.00');
  if(!isMobile) {
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Statement',exact:true}).click();
    await (await download).saveAs('test-results/credit-urdu-statement.pdf');
  }
  await page.getByRole('button',{name:'Restore customer',exact:true}).click();
  await expect(page.getByRole('button',{name:'New credit sale',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Archive customer',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Archive customer',exact:true}).click();
  if(isMobile) await page.getByRole('button',{name:'Customers',exact:true}).click();
  await page.getByRole('button',{name:'Archived',exact:true}).click();
  await expect(page.locator('.credit-person').filter({hasText:name})).toBeVisible();
  await page.locator('.credit-person').filter({hasText:name}).click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('permission errors offer retry without repeated permission prompts',async({page})=>{
  await signIn(page);
  await page.goto('/barcodes');
  await expect(page.getByRole('button',{name:'Read label',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    window.__cameraRequests=0;
    // Install after the route mounts, so navigation/chunk recovery cannot reset
    // the counter underneath an assertion about the camera session.
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      window.__cameraRequests++;throw new DOMException('Denied','NotAllowedError');
    }}});
  });
  await page.getByRole('button',{name:'Read label',exact:true}).click();
  await page.getByRole('button',{name:'Use camera',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Camera permission was denied');
  await expect.poll(()=>page.evaluate(()=>window.__cameraRequests)).toBe(1);
  await page.getByRole('button',{name:'Try camera again',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Camera permission was denied');
  await expect.poll(()=>page.evaluate(()=>window.__cameraRequests)).toBe(2);
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
});
