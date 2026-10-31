import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {linkedSeasonPages, pageEpisodes, pageSeasons, episodeOnSplitPage} from '../src/hdrezka/seasons.js';
const fixture=readFileSync(new URL('./fixtures/svaty-seasons.html',import.meta.url),'utf8');
const episode=(s,e)=>`<li class='b-simple_episode__item' data-season_id='${s}' data-episode_id='${e}'></li>`;
test('real franchise picks explicit Svаты seasons, not franchise positions or spin-offs',()=>{
 for(let s=2;s<=7;s++){
  const pages=linkedSeasonPages(fixture,['The In-Laws','Сваты'],s);
  assert.equal(pages.length,1);assert.equal(pages[0].title,`Сваты ${s}`);
  assert.match(pages[0].path,new RegExp(`svaty-${s}-`));
 }
 assert.deepEqual(linkedSeasonPages(fixture,['Сваты'],0),[]);
 assert.deepEqual(linkedSeasonPages(fixture,['Сваты'],8),[]);
 assert.deepEqual([...pageEpisodes(fixture).get(1)],[1,2]);
});
test('mapping works for another show and normalizes only explicit season labels',()=>{
 const row=(title,path)=>`<div class="b-post__partcontent_item" data-url="${path}"><div class="td title"><a>${title}</a></div><div class="td year">2020 год</div></div>`;
 const html=row('Another Show: Season 3','/series/drama/123-show-3-2020.html')+row('Another Show: Behind the Scenes','/series/documentary/124-other-2020.html')+row('Another Show 3','/films/drama/125-film-2020.html');
 assert.equal(linkedSeasonPages(html,['Another Show'],3).length,1);
 assert.equal(linkedSeasonPages(html,['Other Show'],3).length,0);
});
test('split pages remap only an existing episode and reject excessive episode counts',()=>{
 const html=episode(1,1)+episode(1,2);
 assert.equal(episodeOnSplitPage(html,7,2,2),1);
 assert.equal(episodeOnSplitPage(html,7,3,2),null);
 assert.equal(episodeOnSplitPage(html,7,1,1),null);
 assert.equal(episodeOnSplitPage(html+episode(2,1),7,1,3),null);
 assert.equal(episodeOnSplitPage(episode(3,4),3,4,12),3);
});

import {getStreams} from '../src/hdrezka/extractor.js';
import {cookieJar} from '../src/hdrezka/http.js';
test('extractor selects the season post, uses its local numbering, and rejects year conflicts',async()=>{
 const saved=globalThis.fetch;
 try{
  for(const localSeason of [1,7]){
   const posts=[];
   globalThis.fetch=async(url,init)=>{
    const u=String(url);let body;
    if(u.includes('api.themoviedb.org'))body={name:'The In-Laws',original_name:'Сваты',first_air_date:'2008-12-28',seasons:[{season_number:7,air_date:'2021-12-20',episode_count:9}]};
    else if(u.includes('/engine/ajax/search.php'))body='<a href="/series/comedy/2297-svaty-2008.html"><span class="enty">Сваты</span> (2008)</a>';
    else if(u.includes('/ajax/get_cdn_series/')){posts.push(new URLSearchParams(init.body));body={success:false};}
    else if(u.includes('45097-svaty-7'))body=`sof.tv.initCDNSeriesEvents(45097,1,0);${episode(localSeason,1)}${episode(localSeason,2)}`;
    else body=fixture+'sof.tv.initCDNSeriesEvents(2297,1,0);';
    return {ok:true,headers:{get:()=>null},text:async()=>typeof body==='string'?body:JSON.stringify(body),json:async()=>body};
   };
   cookieJar.clear();await getStreams(46014,'tv',7,2);
   assert.ok(posts.length);assert.equal(posts[0].get('id'),'45097');assert.equal(posts[0].get('season'),String(localSeason));assert.equal(posts[0].get('episode'),'2');
   const originalFetch=globalThis.fetch;
   globalThis.fetch=async(url,init)=>{
    const r=await originalFetch(url,init);
    if(String(url).includes('api.themoviedb.org'))r.text=async()=>JSON.stringify({name:'The In-Laws',original_name:'Сваты',first_air_date:'2008-12-28',seasons:[{season_number:7,air_date:'2020-01-01',episode_count:9}]});
    return r;
   };
   posts.length=0;assert.deepEqual(await getStreams(46014,'tv',7,2),[]);assert.equal(posts.length,0);
  }
 }finally{globalThis.fetch=saved;cookieJar.clear();}
});

test('normal shows advertise seasons before their lazy episode lists load',()=>{
 assert.deepEqual([...pageSeasons(`<li class="b-simple_season__item" data-tab_id="1">Season 1</li><a class="b-simple_season__item" data-tab_id="2">Season 2</a>`+episode(5,1))],[5,1,2]);
});
