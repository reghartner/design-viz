/* Public Cognito app client: authorization code + PKCE, no browser secret.
   Production config never enables fake authentication. Local mock config must
   use a loopback origin and the mock server has its own entrypoint. */
function createFlowviewCloudAuth(config){
  var storage=sessionStorage,key='flowview-cloud-auth:'+config.clientId,token=null;
  var loopback=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if(config.mock && (!loopback || new URL(config.api,location.href).origin!==location.origin))throw Error('Mock cloud access is limited to the same loopback origin.');
  function base64(bytes){return btoa(String.fromCharCode.apply(null,bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function random(){var b=new Uint8Array(32);crypto.getRandomValues(b);return base64(b);}
  function redirect(){return config.redirectUri || location.origin+location.pathname;}
  function endpoint(path){var u=new URL(path,config.domain);if(u.protocol!=='https:')throw Error('Cognito requires HTTPS.');return u.href;}
  return {
    init:async function(){
      if(config.mock){token=storage.getItem(key);return;}
      var url=new URL(location.href),code=url.searchParams.get('code');
      if(url.searchParams.has('error')){var problem=url.searchParams.get('error_description') || url.searchParams.get('error');url.searchParams.delete('error');url.searchParams.delete('error_description');history.replaceState(history.state,'',url);throw Error(problem);}
      if(code){
        var pending=JSON.parse(storage.getItem(key+':pkce') || 'null');storage.removeItem(key+':pkce');
        if(!pending || pending.state!==url.searchParams.get('state') || Date.now()-pending.at>600000)throw Error('Sign-in state expired. Please sign in again.');
        url.searchParams.delete('code');url.searchParams.delete('state');history.replaceState(history.state,'',url);
        var response=await fetch(endpoint('/oauth2/token'),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,code:code,redirect_uri:redirect(),code_verifier:pending.verifier})});
        var data=await response.json();if(!response.ok)throw Error('Sign-in could not finish. Please try again.');
        token={access:data.access_token,expires:Date.now()+data.expires_in*1000};storage.setItem(key,JSON.stringify(token));
        if(pending.returnTo)history.replaceState(history.state,'',pending.returnTo);
      }else{try{token=JSON.parse(storage.getItem(key) || 'null');}catch(error){storage.removeItem(key);}}
    },
    access:function(){if(config.mock)return token;if(!token || token.expires<Date.now()+15000)return null;return token.access;},
    signIn:async function(user){
      if(config.mock){token='mock:'+user;storage.setItem(key,token);return;}
      var verifier=random(),state=random(),challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      storage.setItem(key+':pkce',JSON.stringify({verifier:verifier,state:state,at:Date.now(),returnTo:location.pathname+location.search+location.hash}));
      var url=new URL(endpoint('/oauth2/authorize'));url.search=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:redirect(),scope:'openid email '+config.scope,state:state,code_challenge:challenge,code_challenge_method:'S256'});location.assign(url.href);
    },
    signOut:function(){token=null;storage.removeItem(key);storage.removeItem(key+':pkce');if(!config.mock){var url=new URL(endpoint('/logout'));url.search=new URLSearchParams({client_id:config.clientId,logout_uri:redirect()});location.assign(url.href);}}
  };
}
