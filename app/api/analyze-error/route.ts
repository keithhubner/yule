import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    const { errorContent } = await request.json()

    if (!errorContent) {
      return NextResponse.json({ error: 'Missing error content' }, { status: 400 })
    }

    // Use server-side environment variable for API key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.'
      }, { status: 500 })
    }

    const openai = new OpenAI({
      apiKey: apiKey,
    })

    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo"

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a helpful software engineering assistant that analyzes error messages and log entries. 
          
          When analyzing an error or log entry:
          1. Identify the type of error/issue
          2. Explain what likely caused it
          3. Provide specific, actionable solutions
          4. If applicable, mention relevant documentation or best practices
          5. Keep your response concise but comprehensive
          
          Format your response with clear sections using markdown formatting.`
        },
        {
          role: "user",
          content: `Please analyze this error/log entry and provide insights:

${errorContent}`
        }
      ],
      max_tokens: 800,
      temperature: 0.3,
    })

    const analysis = completion.choices[0]?.message?.content || 'Unable to generate analysis'

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Error in AI analysis:', error)
    
    if (error instanceof Error) {
      // Handle specific OpenAI API errors
      if (error.message.includes('API key')) {
        return NextResponse.json({ 
          error: 'Invalid API key. Please check your OpenAI API key.' 
        }, { status: 401 })
      }
      if (error.message.includes('quota')) {
        return NextResponse.json({ 
          error: 'API quota exceeded. Please check your OpenAI account billing.' 
        }, { status: 429 })
      }
    }
    
    return NextResponse.json({ 
      error: 'Failed to analyze error. Please try again.' 
    }, { status: 500 })
  }
}