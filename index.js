const { Octokit } = require("@octokit/core")
const github = require('@actions/github')
const core = require('@actions/core')
const githubToken = core.getInput('github-token')
const octokit = new Octokit({ auth: githubToken})

var major = 0
var minor = 0
var patch = 0
var contentRelease = `## What's Changed \n`

async function run (){
    if(githubToken){
        let branch_event = github.context.payload.ref.split('/')[2]
        if(branch_event == github.context.payload.repository.default_branch){
            try{
                let {id} = github.context.payload.commits[0]
                let {number, milestone} = await getNumberPullRequestByCommit(id)
                if(number != null){
                    
                    let res = await getRelease(milestone)
                    if(res.status == 200){
                        core.setOutput('success','This pull request is associated with a milestone that has a version equal to a release, so a release will not be generated!')
                    }
                    calculateAndPrepareContentRelease(number, res.last_release)
                }
            }catch(error){
                core.setFailed('There is no pull request associated with this commit!')
            }
        }else{
            core.setFailed('This action will only be performed when the branch is merged with the default branch!')
        }
    }else{
        core.setFailed('Github token is required!')
    }
    
}

async function calculateAndPrepareContentRelease(numberPullRequest, last_release){
    let dataCommits = await getCommits(numberPullRequest)
    
    dataCommits.data.map(async (dataCommit)=>{
        let {commit} = dataCommit
        let {message} = commit
        countSemanticRelease(message)
    })
    
    let lastTag = await findTag()
    
    if(lastTag == null){
        if(major != 0){
            minor = 0
            patch = 0
        }
    
        if(major == 0 && minor != 0){
            patch = 0
        } 
    }

    let nextRelease = lastTag != undefined && lastTag != '' && lastTag != null ? nextTag(lastTag) : `${major}.${minor}.${patch}`
    
    contentRelease += `\n **Full Changelog**: https://github.com/${github.context.payload.repository.owner.name}/${github.context.payload.repository.name}/compare/${last_release}...${nextRelease}\n`
    
    let status = await gerenateReleaseNote(nextRelease, contentRelease)
    if(status == 201){
        console.log('Release note created!')
        core.setOutput('success','Release note created!')
    }else{
        core.setFailed('Error creating release note!')
    }
}

async function getNumberPullRequestByCommit(commitSha){

    let res = await octokit.request('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        commit_sha: commitSha
    })
    let {number, milestone} = res.data.pop();
    
    return {
        number: number,
        milestone: milestone != null ? milestone.title : null
    }
    
}
async function gerenateReleaseNote(release, content){
    try{
        return await octokit.request('POST /repos/{owner}/{repo}/releases', {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name,
            tag_name: release,
            target_commitish: github.context.payload.repository.default_branch,
            name: release,
            body: content,
            draft: false,
            prerelease: false,
            generate_release_notes: false
        })
    }catch{
        console.log('Error creating Release check if there is no release for this PR!')
        return {status: 422}
    }
    
}

function nextTag(lastTag){
    let versions = lastTag.split('.')
    if(versions.length < 3){
        for(let x = versions.length; x < 3; x++){
            versions[x] = '0'
        }
    }
        let prefix = ''

        if(versions[0].match('[v0-9]+')){
            prefix = versions[0].split(/\d/)[0]
        }

        versions[0] = versions[0].split(/([a-z]|[A-z])+\.*/).pop()
        if(major != 0){
            minor = 0
            patch = 0
            versions[1] = 0
            versions[2] = 0
        }
    
        if(major == 0 && minor != 0){
            patch = 0
            versions[2] = 0
        }

        major += Number(versions[0])  
        minor += Number(versions[1]) 
        patch += Number(versions[2])

        return `${prefix}${major}.${minor}.${patch}`
}

async function findTag(){
    try{
        let param = {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name
        }
        let res = await octokit.request('GET /repos/{owner}/{repo}/git/refs/tags', param)
        if(res.status == 200)
            return res.data.pop().ref.split('/').pop()
    }catch(error){
        return null
    }
}

function countSemanticRelease(message){
    let length = message.split('\n')
    if(length.length >= 3 && length.pop() != '' && major == 0 ){
        contentRelease += `- ${message} \n`
        major++
    }else{
        let commitDefaultFeat = /feat:[\s\S]+|feat\(.+\):[\s\S]+/
        let commitDefaultBuild = /build:[\s\S]+|build\(.+\):[\s\S]+/
        let commitDefaultChore = /chore:[\s\S]+|chore\(.+\):[\s\S]+/
        let commitDefaultCi = /ci:[\s\S]+|ci\(.+\):[\s\S]+/
        let commitDefaultDocs = /docs:[\s\S]+|docs\(.+\):[\s\S]+/
        let commitDefaultStyle = /style:[\s\S]+|style\(.+\):[\s\S]+/
        let commitDefaultRefactor = /refactor:[\s\S]+|refactor\(.+\):[\s\S]+/
        let commitDefaultPerf = /perf:[\s\S]+|perf\(.+\):[\s\S]+/
        let commitDefaultFix = /fix:[\s\S]+|fix\(.+\):[\s\S]+/
        let commitDefaultHotFix = /hotfix:[\s\S]+|hotfix\(.+\):[\s\S]+/
        let commitDefaultBreakingChange = /[a-zA-Z]+!:[\s\S]+|[a-zA-Z]+\(.+\)!:[\s\S]+/
        
        
        
        if ((commitDefaultFeat.test(message) || commitDefaultBuild.test(message) || 
            commitDefaultChore.test(message) || commitDefaultCi.test(message) || 
            commitDefaultDocs.test(message) || commitDefaultStyle.test(message) ||
            commitDefaultRefactor.test(message) ||commitDefaultPerf.test(message)) && minor == 0){
            contentRelease += `- ${message} \n`
            minor++
        }

        if ((commitDefaultFix.test(message) || commitDefaultHotFix.test(message)) && patch == 0) {
            contentRelease += `- ${message} \n`
            patch++
        }

        if (commitDefaultBreakingChange.test(message) && major == 0) {
            contentRelease += `- ${message} \n`
            major++
        }
    }
}

async function getCommits(number){
    return octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        pull_number: number
    })

}

async function getRelease(milestone){
    
        let number_release = milestone != null? milestone.split(/([a-z]|[A-z])+\.*/).pop() : null
        return octokit.request('GET /repos/{owner}/{repo}/releases', {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name
        }).then((res)=>{
            let isRelease = false
            if(number_release != null){
                res.data.map(({tag_name})=>{
                    if(tag_name.split(/([a-z]|[A-z])+\.*/).pop() == number_release) 
                        isRelease = true;
                })
            }
                
            return isRelease ? res.push({last_release: res.data[0].tag_name}) : {status: 404, last_release: res.data[0].tag_name}
        }).catch(()=>{            
            return {status: 404, last_release: null}
        })

}
run()