/* Kid Zone smooth, infinite, draggable 3D carousel. No external dependencies. */
(function(global){'use strict';
function mount(root,games,onLaunch){
 if(!root)return;root.replaceChildren();root.innerHTML='<div class="kz-carousel-stage" aria-label="Choose a game"></div><button class="kz-arrow kz-prev" aria-label="Previous game">❮</button><button class="kz-arrow kz-next" aria-label="Next game">❯</button><div class="kz-dots"></div><div class="kz-swipe-tip">⇆ &nbsp; Drag or swipe to explore games</div>';
 const stage=root.querySelector('.kz-carousel-stage'), dots=root.querySelector('.kz-dots');let position=0,target=0,frame=0,drag=null,suppressClick=false;const cards=[];
 const wrap=n=>(n%games.length+games.length)%games.length;
 const shortest=(index,p)=>{let delta=index-p;return delta-Math.round(delta/games.length)*games.length};
 games.forEach((game,index)=>{const b=document.createElement('button');b.className='kz-game-card';b.type='button';b.setAttribute('aria-label','Select '+game.name);const img=document.createElement('img');img.src=game.image;img.alt=game.name;img.draggable=false;b.append(img);stage.append(b);cards.push(b);b.addEventListener('click',()=>{if(suppressClick)return;const d=shortest(index,target);if(Math.abs(d)<.48)onLaunch(game);else moveTo(target+Math.round(d))})});
 games.forEach((game,i)=>{const b=document.createElement('button');b.type='button';b.className='kz-dot';b.setAttribute('aria-label','Show '+game.name);b.addEventListener('click',()=>moveTo(target+Math.round(shortest(i,target))));dots.append(b)});
 function render(){if(!games.length)return;let nearest=wrap(Math.round(position));cards.forEach((b,i)=>{let d=shortest(i,position),a=Math.abs(d),visible=a<1.65;b.style.opacity=visible?String(Math.max(0,1-Math.max(0,a-1.15)*1.9)):'0';b.style.visibility=visible?'visible':'hidden';b.style.pointerEvents=a<.68?'auto':'auto';b.style.zIndex=String(100-Math.round(a*10));const x=d*83,scale=1.10-Math.min(a,2)*.22,rot=-d*13,y=Math.min(a,2)*5;b.style.transform=`translate(-50%,-50%) translate(${x}%,${y}%) scale(${scale}) rotateY(${rot}deg)`;b.setAttribute('aria-label',(a<.5?'Play ':'Select ')+games[i].name);b.tabIndex=a<1.4?0:-1});[...dots.children].forEach((b,i)=>b.classList.toggle('active',i===nearest));}
 function tick(){frame=0;if(drag===null){let delta=target-position;position+=delta*.15;if(Math.abs(delta)<.001)position=target}render();if(drag!==null||Math.abs(target-position)>.001)frame=requestAnimationFrame(tick)}
 function animate(){if(!frame)frame=requestAnimationFrame(tick)}
 function moveTo(n){target=n;animate()}
 root.querySelector('.kz-prev').onclick=()=>moveTo(Math.round(target)-1);root.querySelector('.kz-next').onclick=()=>moveTo(Math.round(target)+1);
 stage.style.touchAction='pan-y';stage.addEventListener('pointerdown',e=>{if(!games.length)return;drag={x:e.clientX,start:position,moved:false};stage.setPointerCapture(e.pointerId);target=position;animate()});stage.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>6)drag.moved=true;const width=stage.getBoundingClientRect().width;position=drag.start-dx/(width*.27);target=position;render()});
 // Tap-to-select/launch is resolved here, not via each card's own 'click' listener above:
 // stage.setPointerCapture() on pointerdown (below) retargets the eventual 'click' event to
 // `stage` itself per the Pointer Events spec, so it never reaches a card button's listener
 // (confirmed: pointerdown/pointerup fire, 'click' does not). The per-card listener is left in
 // place as a harmless no-op fallback for engines that don't retarget it.
 function end(e){if(!drag)return;const moved=drag.moved,rx=e.clientX,ry=e.clientY;drag=null;if(moved){suppressClick=true;setTimeout(()=>suppressClick=false,80)}target=Math.round(position);if(!moved){const hit=document.elementFromPoint(rx,ry);const cardEl=hit&&hit.closest?hit.closest('.kz-game-card'):null;const index=cardEl?cards.indexOf(cardEl):-1;if(index!==-1){const d=shortest(index,target);if(Math.abs(d)<.48)onLaunch(games[index]);else target=target+Math.round(d)}}animate()}
 stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
 root.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();moveTo(Math.round(target)-1)}if(e.key==='ArrowRight'){e.preventDefault();moveTo(Math.round(target)+1)}});
 render();return{next:()=>moveTo(Math.round(target)+1),prev:()=>moveTo(Math.round(target)-1),select:i=>moveTo(target+Math.round(shortest(i,target))),refresh:render};
}
global.KidZoneGamesCarousel={mount};})(window);
