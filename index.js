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
            let {id} = github.context.payload.commits[0]
            let numberPullRequest = await getNumberPullRequestByCommit(id)
            if(numberPullRequest != null){
                calculateAndPrepareContentRelease(numberPullRequest)
            }else{
                core.setFailed('There is no pull request associated with this commit')
            }
        }else{
            core.setFailed('This action will only run when the branch is merged into the default branch!')
        }
    }else{
        core.setFailed('Github token is required')
    }
}

async function calculateAndPrepareContentRelease(numberPullRequest){
    let dataCommits = await getCommits(numberPullRequest)
    
    dataCommits.data.map(async (dataCommit)=>{
        let {commit} = dataCommit
        let {message} = commit
        countSemanticRelease(message)
    })

    let lastTag = await findTag()
    let nextRelease = lastTag != undefined && lastTag != '' && lastTag != null ? nextTag(lastTag) : `${major}.${minor}.${patch}`
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

    if(res.status != 200)
        return null

    return res.data.pop().number
}
async function gerenateReleaseNote(release, content){
    let res = await octokit.request('POST /repos/{owner}/{repo}/releases', {
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

    return res.status
}

function nextTag(lastTag){
    let versions = lastTag.split('.')
    if(versions.length == 3){
        let prefix = ''
        
        if(versions[0].match('[v0-9]+')){
            prefix = versions[0].split(/\d/)[0]
        }
        
        versions[0] = versions[0].split(/([a-z]|[A-z])+\.*/).pop()
        major += Number(versions[0])  
        minor += Number(versions[1]) 
        patch += Number(versions[2]) 
        
        return `${prefix}${major}.${minor}.${patch}`
    }
}

async function findTag(){
    let param = {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name
    }
    let res = await octokit.request('GET /repos/{owner}/{repo}/git/refs/tags', param)
    return res.data.pop().ref.split('/').pop()
}

function countSemanticRelease(message){
    let length = message.split('\n')
    if(length.length >= 3 && length.pop() != '' ){
        contentRelease += `- ${message} \n`
        major++
    }else{
        let commitDefaultFeat = /feat+\:.*/
        let commitDefaultBuild = /build+\:.*/
        let commitDefaultChore = /chore+\:.*/
        let commitDefaultCi = /ci+\:.*/
        let commitDefaultDocs = /docs:+\:.*/
        let commitDefaultStyle = /style:+\:.*/
        let commitDefaultRefactor = /refactor:+\:.*/
        let commitDefaultPerf = /perf:+\:.*/
        let commitDefaultFix = /fix+\:.*/
        let commitDefaultBreakingChange = /([a-z]|[A-z])+\!.*/
        
        
        
        if (commitDefaultFeat.test(message) || commitDefaultBuild.test(message) || 
            commitDefaultChore.test(message) || commitDefaultCi.test(message) || 
            commitDefaultDocs.test(message) || commitDefaultStyle.test(message) ||
            commitDefaultRefactor.test(message) ||commitDefaultPerf.test(message)){
            contentRelease += `- ${message} \n`
            minor++
        }

        if (commitDefaultFix.test(message)) {
            contentRelease += `- ${message} \n`
            patch++
        }

        if (commitDefaultBreakingChange.test(message)) {
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
run()