import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useStream } from "../hooks/use-stream";
import { Markdown } from "../components/markdown";

import { useQueryClient } from "@tanstack/react-query";
import { getGetClassroomHistoryQueryKey, saveClassroomHistoryItem } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { BookOpen, Loader2 } from "lucide-react";

const formSchema = z.object({
  topic: z.string().min(2, "Topic is required"),
  subject: z.string().min(2, "Subject is required"),
  gradeLevel: z.string().min(1, "Grade level is required"),
  duration: z.string().optional(),
});

export function LessonPlan() {
  const { content, isStreaming, startStream } = useStream();
  const [hasGenerated, setHasGenerated] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      subject: "",
      gradeLevel: "",
      duration: "60 minutes",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setHasGenerated(true);
    const generated = await startStream("/api/classroom/lesson-plan", values);

    if (generated) {
      await saveClassroomHistoryItem(user?.id || "", {
        type: "lesson-plan",
        topic: values.topic,
        subject: values.subject,
        title: `${values.topic} (${values.gradeLevel})`,
        content: generated,
      });
      queryClient.invalidateQueries({ queryKey: getGetClassroomHistoryQueryKey(user?.id) });
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-serif font-bold text-foreground">Lesson Plan Generator</h1>
        <p className="text-muted-foreground mt-2">Design structured, engaging lessons aligned with your curriculum.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <Card className="p-6 lg:col-span-1 border-paper-line/50 sticky top-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. The Cell Cycle" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Biology" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="freshman">Freshman (1st Year)</SelectItem>
                        <SelectItem value="sophomore">Sophomore (2nd Year)</SelectItem>
                        <SelectItem value="junior">Junior (3rd Year)</SelectItem>
                        <SelectItem value="senior">Senior (4th Year)</SelectItem>
                        <SelectItem value="graduate">Graduate Level</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 60 minutes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isStreaming}>
                {isStreaming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Generate Lesson Plan
                  </>
                )}
              </Button>
            </form>
          </Form>
        </Card>

        <div className="lg:col-span-2">
          {hasGenerated ? (
            <Card className="p-8 min-h-[500px] border-paper-line/50 bg-paper">
              {content ? (
                <div className="animate-in fade-in duration-500">
                  <Markdown content={content} />
                  {isStreaming && (
                    <span className="inline-block w-2 h-5 ml-1 bg-primary animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 pt-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                  <p>Synthesizing academic materials...</p>
                </div>
              )}
            </Card>
          ) : (
            <div className="h-full min-h-[500px] border-2 border-dashed border-paper-line/50 rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
              <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p>Fill out the form to generate a lesson plan.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}